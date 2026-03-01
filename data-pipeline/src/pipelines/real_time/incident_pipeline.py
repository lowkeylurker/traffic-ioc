"""Incident ETL Pipeline.

Extract : TomTom Traffic Incidents API
Transform: Validate + map incident type + compute geometry centroid
Load    : UPSERT → fact_incident (partitioned by date_key, PostGIS Point)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from dateutil.parser import parse as dt_parse
from pydantic import ValidationError
from sqlalchemy import Engine

from src.core.config import settings
from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.tomtom_schema import TomTomIncidentResponse
from src.utils.geo_ops import coords_to_wkt_point, linestring_centroid
from src.utils.math_calc import TZ_HCM, derive_date_key, derive_time_key, generate_incident_key
from src.utils.weather_mapping import derive_is_active, get_icon_category_type, normalize_magnitude


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class IncidentExtractor(BaseExtractor):
    """Gọi TomTom Traffic Incidents API."""

    BASE_URL = "https://api.tomtom.com/traffic/services/5/incidentDetails"
    DEFAULT_TIMEOUT = 15
    MAX_RETRIES = 3
    RETRY_WAIT = 3

    def extract(self, **kwargs: Any) -> dict:
        """Lấy incidents trong bounding box.

        Kwargs:
            bbox: dict with min_lon, min_lat, max_lon, max_lat
        """
        from src.utils.geo_ops import BBOX_DISTRICT_1

        bbox = kwargs.get("bbox", BBOX_DISTRICT_1)

        bbox_str = (
            f"{bbox['min_lat']},{bbox['min_lon']},"
            f"{bbox['max_lat']},{bbox['max_lon']}"
        )

        url = f"{self.BASE_URL}"
        params = {
            "key": self.api_key,
            "bbox": bbox_str,
            "fields": (
                "{incidents{type,geometry{type,coordinates},"
                "properties{id,iconCategory,magnitudeOfDelay,"
                "startTime,endTime,from,to,delay,length}}}"
            ),
            "language": "vi-VN",
            "timeValidityFilter": "present",
        }

        self.logger.info(f"Extracting incidents for bbox: {bbox_str}")
        return self._get(url, params=params)


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class IncidentTransformer(BaseTransformer):
    """Validate + transform TomTom incident data."""

    def transform(self, raw_data: dict) -> list[dict]:
        """Transform incidents response → fact_incident records.

        Returns:
            list[dict]: Each dict = 1 row fact_incident.
        """
        try:
            validated = TomTomIncidentResponse.model_validate(raw_data)
        except ValidationError as e:
            self.logger.warning(f"Incident response validation failed: {e}")
            return []

        records = []

        for feature in validated.incidents:
            props = feature.properties
            geom = feature.geometry

            # Incident key
            incident_id = props.id if props.id else f"unknown_{len(records)}"
            incident_key = generate_incident_key(incident_id)

            # Timestamp
            if props.start_time:
                try:
                    ts = dt_parse(props.start_time)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=TZ_HCM)
                except (ValueError, TypeError):
                    ts = datetime.now(tz=TZ_HCM)
            else:
                ts = datetime.now(tz=TZ_HCM)

            date_key = derive_date_key(ts)
            time_key = derive_time_key(ts)

            # Geometry centroid
            if geom and geom.coordinates:
                centroid_lon, centroid_lat = linestring_centroid(geom.coordinates)
            else:
                centroid_lon, centroid_lat = 106.7011, 10.7764  # HCM center

            # Incident type & severity
            icon_cat = props.icon_category if props.icon_category is not None else 0
            incident_type = get_icon_category_type(icon_cat)
            severity = normalize_magnitude(props.magnitude_of_delay)
            delay_seconds = props.delay if props.delay is not None else 0

            is_active = derive_is_active(props.end_time)

            records.append(
                {
                    "incident_key": incident_key,
                    "time_key": time_key,
                    "date_key": date_key,
                    "segment_key": 0,  # requires spatial join, set downstream
                    "location_key": None,
                    "incident_type": incident_type,
                    "timestamp": ts.replace(tzinfo=None),
                    "severity_level": severity,
                    "delay_seconds": delay_seconds,
                    "geometry_wkt": coords_to_wkt_point(centroid_lon, centroid_lat),
                    "is_simulated": False,
                    "is_active": is_active,
                    "inserted_at": datetime.utcnow(),
                    "quality_flag": 5,  # medium confidence default
                }
            )

        self.logger.info(f"Transformed {len(records)} fact_incident records")
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class IncidentLoader(BaseLoader):
    """UPSERT fact_incident (PostGIS Point geometry → raw SQL)."""

    TABLE_NAME = "fact_incident"
    CONFLICT_KEYS = ["incident_key", "date_key"]
    UPDATE_COLUMNS = [
        "severity_level",
        "delay_seconds",
        "is_active",
        "quality_flag",
        "inserted_at",
    ]
    BATCH_SIZE = 500

    _SQL = """
        INSERT INTO fact_incident (
            incident_key, time_key, date_key, segment_key, location_key,
            incident_type, timestamp, severity_level, delay_seconds,
            geometry, is_simulated, is_active, inserted_at, quality_flag
        ) VALUES (
            :incident_key, :time_key, :date_key, :segment_key, :location_key,
            :incident_type, :timestamp, :severity_level, :delay_seconds,
            ST_GeomFromText(:geometry_wkt, 4326), :is_simulated, :is_active,
            :inserted_at, :quality_flag
        )
        ON CONFLICT (incident_key, date_key) DO UPDATE SET
            severity_level = EXCLUDED.severity_level,
            delay_seconds = EXCLUDED.delay_seconds,
            is_active = EXCLUDED.is_active,
            quality_flag = EXCLUDED.quality_flag,
            inserted_at = EXCLUDED.inserted_at
    """

    def load(self, records: list[dict]) -> int:
        for r in records:
            r["inserted_at"] = datetime.utcnow()
        return self._upsert_raw_sql(self._SQL, records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, api_key: str = "", **kwargs) -> int:
    """Chạy full ETL cho Incidents.

    Args:
        engine: SQLAlchemy Engine.
        api_key: TomTom API key.

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("incident_pipeline")

    key = api_key or settings.tomtom_api_key

    # E
    extractor = IncidentExtractor(api_key=key)
    raw = extractor.extract(**kwargs)
    logger.info("Extracted incidents from TomTom")

    # T
    transformer = IncidentTransformer()
    records = transformer.transform(raw)
    logger.info(f"Transformed {len(records)} records")

    # L
    loader = IncidentLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_incident")

    return count
