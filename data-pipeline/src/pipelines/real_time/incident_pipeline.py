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
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
from src.domain.geo import coords_to_wkt_point, linestring_centroid
from src.domain.geo.constants import BBOX_HCM, CENTER_HCM
from src.domain.math import TZ_HCM, derive_date_key, derive_time_key
from src.domain.math.key_generator import generate_incident_key
from src.domain.weather import derive_is_active, get_icon_category_type, normalize_magnitude
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.tomtom_schema import TomTomIncidentResponse


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
        bbox = kwargs.get("bbox", BBOX_HCM)
        time_validity_filter = kwargs.get("time_validity_filter", "present")
        fallback_to_all = kwargs.get("fallback_to_all", True)

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
            "language": "en-US",
            "timeValidityFilter": time_validity_filter,
        }

        self.logger.info(
            f"Extracting incidents for bbox: {bbox_str} (timeValidityFilter={time_validity_filter})"
        )
        data = self._get(url, params=params)

        incidents = data.get("incidents", []) if isinstance(data, dict) else []
        self.logger.info(
            f"Incident API returned {len(incidents)} incidents with filter={time_validity_filter}"
        )

        if (
            fallback_to_all
            and time_validity_filter == "present"
            and isinstance(data, dict)
            and not incidents
        ):
            fallback_params = dict(params)
            fallback_params["timeValidityFilter"] = "all"
            self.logger.info(
                "No present incidents found; retrying Incident API with timeValidityFilter=all"
            )
            fallback_data = self._get(url, params=fallback_params)
            fallback_incidents = (
                fallback_data.get("incidents", []) if isinstance(fallback_data, dict) else []
            )
            self.logger.info(
                f"Incident API returned {len(fallback_incidents)} incidents with filter=all"
            )
            return fallback_data

        return data


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class IncidentTransformer(BaseTransformer):
    """Validate + transform TomTom incident data."""

    def __init__(
        self,
        *,
        segment_location_pairs: list[tuple[int, int | None]] | None = None,
    ) -> None:
        super().__init__()
        self._segment_location_pairs = segment_location_pairs or []

    def _resolve_segment_location(self, idx: int) -> tuple[int, int | None]:
        if idx >= len(self._segment_location_pairs):
            return (0, None)
        return self._segment_location_pairs[idx]

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

        for idx, feature in enumerate(validated.incidents):
            props = feature.properties
            geom = feature.geometry

            # Incident key
            incident_id = props.id if props.id else f"unknown_{idx}"
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
                centroid_lon, centroid_lat = CENTER_HCM["lon"], CENTER_HCM["lat"]

            segment_key, location_key = self._resolve_segment_location(idx)
            if segment_key <= 0:
                self.logger.warning(
                    f"Skip incident {incident_id}: cannot resolve valid segment_key"
                )
                continue

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
                    "segment_key": segment_key,
                    "location_key": location_key,
                    "incident_type": incident_type,
                    "timestamp": ts.replace(tzinfo=None),
                    "severity_level": severity,
                    "delay_seconds": delay_seconds,
                    "geometry_wkt": coords_to_wkt_point(centroid_lon, centroid_lat),
                    "is_simulated": False,
                    "is_active": is_active,
                    "inserted_at": datetime.utcnow(),
                    "quality_flag": 5,
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
    raw_count = len(raw.get("incidents", [])) if isinstance(raw, dict) else 0
    logger.info(f"Extracted incidents from TomTom: {raw_count} incidents")

    segment_location_pairs: list[tuple[int, int | None]] = []

    try:
        preview = TomTomIncidentResponse.model_validate(raw)
    except ValidationError:
        preview = None

    if preview and preview.incidents:
        logger.info(f"Validated {len(preview.incidents)} incidents for transformation")
        nearest_sql = text("""
            SELECT ds.segment_key, ds.location_key
            FROM dim_segment ds
            WHERE ds.geometry_center IS NOT NULL
            ORDER BY ds.geometry_center <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
            LIMIT 1
        """)

        with Session(engine) as session:
            for feature in preview.incidents:
                geom = feature.geometry
                if geom and geom.coordinates:
                    centroid_lon, centroid_lat = linestring_centroid(geom.coordinates)
                else:
                    centroid_lon, centroid_lat = CENTER_HCM["lon"], CENTER_HCM["lat"]

                row = session.execute(
                    nearest_sql,
                    {"lon": centroid_lon, "lat": centroid_lat},
                ).first()

                if row is None:
                    segment_location_pairs.append((0, None))
                else:
                    segment_location_pairs.append(
                        (
                            int(row[0]),
                            int(row[1]) if row[1] is not None else None,
                        )
                    )

    if raw_count > 0 and not segment_location_pairs:
        logger.warning(
            "Incidents were extracted but no segment-location pairs were resolved; transformed records may be 0"
        )

    # T
    transformer = IncidentTransformer(segment_location_pairs=segment_location_pairs)
    records = transformer.transform(raw)
    logger.info(f"Transformed {len(records)} records")

    # L
    loader = IncidentLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_incident")

    return count
