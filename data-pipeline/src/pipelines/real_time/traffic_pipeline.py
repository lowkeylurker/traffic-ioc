"""Traffic Flow ETL Pipeline.

Extract : TomTom Traffic Flow API (per segment coordinate)
Transform: Validate + calculate derived traffic metrics
Load    : UPSERT → fact_traffic_flow (partitioned by date_key)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Engine

from src.core.config import settings
from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.tomtom_schema import TomTomFlowResponse
from src.utils.math_calc import (
    TZ_HCM,
    calculate_congestion_level,
    calculate_delay_seconds,
    calculate_los_level,
    calculate_quality_flag,
    calculate_traffic_index,
    derive_date_key,
    derive_time_key,
    estimate_pcu_from_speed,
    generate_traffic_flow_key,
)


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class TrafficExtractor(BaseExtractor):
    """Gọi TomTom Traffic Flow API cho danh sách tọa độ segment."""

    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData"
    DEFAULT_TIMEOUT = 10
    MAX_RETRIES = 3
    RETRY_WAIT = 2

    def extract(self, **kwargs: Any) -> list[dict]:
        """Gọi API cho danh sách tọa độ (lat, lon).

        Kwargs:
            points: list[tuple[float, float]] – (lat, lon) per segment.

        Returns:
            list[dict]: Raw JSON responses (1 per point).
        """
        points: list[tuple[float, float]] = kwargs.get("points", [])
        results = []

        self.logger.info(f"Extracting traffic flow for {len(points)} segments")

        for lat, lon in points:
            url = f"{self.BASE_URL}/absolute/10/json"
            params = {
                "key": self.api_key,
                "point": f"{lat},{lon}",
                "unit": "KMPH",
            }
            try:
                data = self._get(url, params=params)
                results.append(data)
            except DataExtractionError as e:
                self.logger.warning(f"Skip point ({lat},{lon}): {e.message}")
                continue

        self.logger.info(
            f"Extracted {len(results)}/{len(points)} responses"
        )
        return results


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class TrafficTransformer(BaseTransformer):
    """Validate + tính toán traffic metrics."""

    def __init__(
        self,
        segment_keys: list[int] | None = None,
        segment_key_map: dict[tuple[float, float], int] | None = None,
    ) -> None:
        super().__init__()
        # Index-based lookup (preferred): response[i] → segment_keys[i]
        self._segment_keys = segment_keys or []
        # Fallback: coordinate-based lookup
        self._segment_key_map = segment_key_map or {}

    def _resolve_segment_key(self, idx: int, seg: Any) -> int:
        """Resolve segment_key by index first, then by coordinate lookup."""
        # 1. Index-based (most reliable)
        if idx < len(self._segment_keys):
            return self._segment_keys[idx]
        # 2. Coordinate-based fallback
        coords = seg.coordinates
        if coords and coords.coordinate:
            coord = coords.coordinate[0]
            key = self._segment_key_map.get(
                (round(coord.latitude, 6), round(coord.longitude, 6)), 0
            )
            if key:
                return key
        return 0

    def transform(
        self,
        raw_data: list[dict],
        *,
        weather_key: int = 800,
    ) -> list[dict]:
        """Transform raw TomTom responses → fact_traffic_flow records.

        Args:
            raw_data: List of TomTom Flow API raw JSON responses.
            weather_key: FK → dim_weather (from weather_pipeline).

        Returns:
            list[dict]: Mỗi dict = 1 row fact_traffic_flow.
        """
        records = []
        now = datetime.now(tz=TZ_HCM)

        for idx, item in enumerate(raw_data):
            try:
                validated = TomTomFlowResponse.model_validate(item)
            except ValidationError as e:
                self.logger.warning(f"Skip invalid record: {e}")
                continue

            seg = validated.flow_segment_data
            current_speed = seg.current_speed
            free_flow_speed = seg.free_flow_speed
            current_tt = seg.current_travel_time
            free_flow_tt = seg.free_flow_travel_time
            confidence = seg.confidence
            is_closed = seg.road_closure

            # Derived metrics
            traffic_index = calculate_traffic_index(current_speed, free_flow_speed)
            los = calculate_los_level(traffic_index)
            congestion = calculate_congestion_level(los)
            delay = calculate_delay_seconds(current_tt, free_flow_tt)
            quality = calculate_quality_flag(confidence)

            # Resolve segment_key (index-based → coord fallback)
            segment_key = self._resolve_segment_key(idx, seg)
            if segment_key == 0:
                self.logger.warning(f"Skip record {idx}: cannot resolve segment_key")
                continue

            date_key = derive_date_key(now)
            time_key = derive_time_key(now)

            flow_key = generate_traffic_flow_key(segment_key, date_key, time_key)

            # Estimate PCU volume
            lane_count = 2  # default, can be enriched from dim_segment
            pcu_volume = estimate_pcu_from_speed(
                current_speed, free_flow_speed, lane_count
            )

            records.append(
                {
                    "traffic_flow_key": flow_key,
                    "segment_key": segment_key,
                    "time_key": time_key,
                    "date_key": date_key,
                    "weather_key": weather_key,
                    "timestamp": now.replace(tzinfo=None),  # DB expects naive UTC
                    "pcu_volume": pcu_volume,
                    "traffic_index": round(traffic_index, 2),
                    "current_speed_kmh": round(current_speed, 2),
                    "free_flow_speed_kmh": round(free_flow_speed, 2),
                    "delay_seconds": delay,
                    "los_level": los,
                    "congestion_level": congestion,
                    "is_closed": is_closed,
                    "inserted_at": datetime.utcnow(),
                    "quality_flag": quality,
                }
            )

        self.logger.info(f"Transformed {len(records)} fact_traffic_flow records")
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class TrafficLoader(BaseLoader):
    TABLE_NAME = "fact_traffic_flow"
    CONFLICT_KEYS = ["traffic_flow_key", "date_key"]
    UPDATE_COLUMNS = [
        "current_speed_kmh",
        "free_flow_speed_kmh",
        "pcu_volume",
        "traffic_index",
        "delay_seconds",
        "los_level",
        "congestion_level",
        "is_closed",
        "quality_flag",
        "inserted_at",
    ]
    BATCH_SIZE = 500

    def load(self, records: list[dict]) -> int:
        for r in records:
            r["inserted_at"] = datetime.utcnow()
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, api_key: str = "", weather_key: int = 800, **kwargs) -> int:
    """Chạy full ETL cho Traffic Flow.

    Args:
        engine: SQLAlchemy Engine.
        api_key: TomTom API key.
        weather_key: FK → dim_weather (from weather_pipeline.run()).
        **kwargs: points: list[(lat, lon)] of segment centers.

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("traffic_pipeline")

    key = api_key or settings.tomtom_api_key
    points = kwargs.get("points", [])

    # E
    extractor = TrafficExtractor(api_key=key)
    raw = extractor.extract(points=points)
    logger.info(f"Extracted {len(raw)} raw responses")

    # T
    transformer = TrafficTransformer(
        segment_keys=kwargs.get("segment_keys"),
        segment_key_map=kwargs.get("segment_key_map"),
    )
    records = transformer.transform(raw, weather_key=weather_key)
    logger.info(f"Transformed {len(records)} records")

    # L
    loader = TrafficLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_traffic_flow")

    return count
