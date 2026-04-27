"""Traffic Flow ETL Pipeline.

Extract : TomTom Traffic Flow API (per segment coordinate)
Transform: Validate + calculate derived traffic metrics
Load    : UPSERT → fact_traffic_flow (partitioned by date_key)
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import os
from typing import Any

from pydantic import ValidationError
from sqlalchemy import Engine

from src.core.config import settings
from src.core.exceptions import DataExtractionError
from src.core.logger import get_logger
from src.domain.math import (
    TZ_HCM,
    calculate_congestion_level,
    calculate_delay_seconds,
    calculate_los_level,
    calculate_quality_flag,
    calculate_traffic_index,
    derive_date_key,
    derive_time_key,
    estimate_pcu_from_speed,
)
from src.domain.math.key_generator import generate_traffic_flow_key
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer
from src.schemas.tomtom_schema import TomTomFlowResponse


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class TrafficExtractor(BaseExtractor):
    """Gọi TomTom Traffic Flow API cho danh sách tọa độ segment."""

    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData"
    DEFAULT_TIMEOUT = 10
    MAX_RETRIES = 3
    RETRY_WAIT = 2

    def __init__(self, api_key: str = "", key_pool=None, **kwargs: Any) -> None:
        super().__init__(api_key=api_key, **kwargs)
        # key_pool: TomTomKeyPool instance (optional).  When supplied,
        # each request draws the key with the most remaining daily budget.
        self._key_pool = key_pool
        self._max_workers = max(1, int(os.getenv("MAX_WORKERS_PHASE3", "8")))

    def _extract_one_point(
        self,
        idx: int,
        lat: float,
        lon: float,
        pool,
    ) -> tuple[int, dict | None]:
        """Extract a single point, retrying with next key if current key is blocked (403)."""
        while True:
            key = pool.get_next_key() if pool else self.api_key
            if key is None:
                return idx, None

            url = f"{self.BASE_URL}/absolute/10/json"
            params = {
                "key": key,
                "point": f"{lat},{lon}",
                "unit": "KMPH",
            }
            try:
                data = self._get(url, params=params)
                if pool:
                    pool.record_success(key)
                return idx, data
            except DataExtractionError as e:
                message = e.message or ""
                if pool and "403" in message:
                    pool.mark_blocked(key)
                    self.logger.warning(
                        "Retry point (%s,%s) with next key after 403", lat, lon
                    )
                    continue
                self.logger.debug("Skip point (%s,%s): %s", lat, lon, message)
                return idx, None

    def extract(self, **kwargs: Any) -> list[dict]:
        """Gọi API cho danh sách tọa độ (lat, lon).

        Kwargs:
            points: list[tuple[float, float]] – (lat, lon) per segment.

        Returns:
            list[dict]: Raw JSON responses (1 per point).
        """
        points: list[tuple[float, float]] = kwargs.get("points", [])
        results_by_idx: dict[int, dict] = {}
        pool = self._key_pool

        pool_desc = f"pool({pool.pool_size} keys)" if pool else "single-key"
        self.logger.info(
            "Extracting traffic flow for %d segments [%s, max_workers=%d]",
            len(points),
            pool_desc,
            self._max_workers,
        )

        skipped_points = 0
        with ThreadPoolExecutor(max_workers=self._max_workers) as executor:
            future_map = {
                executor.submit(self._extract_one_point, idx, lat, lon, pool): idx
                for idx, (lat, lon) in enumerate(points)
            }
            for future in as_completed(future_map):
                idx, data = future.result()
                if data is None:
                    skipped_points += 1
                    continue
                results_by_idx[idx] = data

        # Keep deterministic ordering by original point index.
        results = [results_by_idx[i] for i in sorted(results_by_idx.keys())]

        if pool:
            self.logger.info(
                "Extracted %d/%d responses (skipped=%d) | pool status: %s",
                len(results),
                len(points),
                skipped_points,
                pool.status(),
            )
        else:
            self.logger.info(
                "Extracted %d/%d responses (skipped=%d)",
                len(results),
                len(points),
                skipped_points,
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
        lane_count_map: dict[int, int] | None = None,
    ) -> None:
        super().__init__()
        # Index-based lookup (preferred): response[i] → segment_keys[i]
        self._segment_keys = segment_keys or []
        # Fallback: coordinate-based lookup
        self._segment_key_map = segment_key_map or {}
        # Optional enrichment from dim_way.default_lane_count
        self._lane_count_map = lane_count_map or {}

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
        weather_key_map: dict[int, int] | None = None,
    ) -> list[dict]:
        """Transform raw TomTom responses → fact_traffic_flow records.

        Args:
            raw_data: List of TomTom Flow API raw JSON responses.
            weather_key: FK → dim_weather (from weather_pipeline).

        Returns:
            list[dict]: Mỗi dict = 1 row fact_traffic_flow.
        """
        weather_key_map = weather_key_map or {}
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

            # ⚠️ Validate critical fields (skip if invalid)
            if free_flow_speed <= 0:
                self.logger.warning(
                    f"Skip record {idx}: invalid free_flow_speed={free_flow_speed}"
                )
                continue

            if current_speed < 0:
                self.logger.warning(
                    f"Skip record {idx}: invalid current_speed={current_speed}"
                )
                continue

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
            lane_count = max(1, int(self._lane_count_map.get(segment_key, 2)))
            pcu_volume = estimate_pcu_from_speed(
                current_speed,
                free_flow_speed,
                lane_count,
                bpr_alpha=settings.pcu_bpr_alpha,
                bpr_beta=settings.pcu_bpr_beta,
                max_vc_ratio=settings.pcu_max_vc_ratio,
            )

            records.append(
                {
                    "traffic_flow_key": flow_key,
                    "segment_key": segment_key,
                    "time_key": time_key,
                    "date_key": date_key,
                    "weather_key": int(weather_key_map.get(segment_key, weather_key)),
                    "timestamp": now.replace(tzinfo=None),  # DB expects naive UTC
                    "pcu_volume": pcu_volume,
                    "traffic_index": round(traffic_index, 2),
                    "current_speed_kmh": round(current_speed, 2),
                    "free_flow_speed_kmh": round(free_flow_speed, 2),
                    "delay_seconds": delay,
                    "los_level": los,
                    "congestion_level": congestion,
                    "is_closed": is_closed,
                    "is_incident_triggered": False,
                    # inserted_at: không set (dùng DB DEFAULT CURRENT_TIMESTAMP)
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
        "is_incident_triggered",
        "quality_flag",
        # Không include inserted_at - lần insert đầu tiên dùng DB DEFAULT
    ]
    BATCH_SIZE = 500

    def load(self, records: list[dict]) -> int:
        # Không set inserted_at - để database tự set DEFAULT CURRENT_TIMESTAMP
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(
    engine: Engine,
    api_key: str = "",
    weather_key: int = 800,
    weather_key_map: dict[int, int] | None = None,
    **kwargs,
) -> int:
    """Chạy full ETL cho Traffic Flow.

    Args:
        engine: SQLAlchemy Engine.
        api_key: TomTom API key.
        weather_key: FK → dim_weather (from weather_pipeline.run()).
        weather_key_map: Optional segment_key -> weather_key mapping (grid mode).
        **kwargs: points: list[(lat, lon)] of segment centers.

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("traffic_pipeline")

    from src.core.api_key_pool import get_key_pool

    points = kwargs.get("points", [])

    # Use explicit key in legacy single-key mode; otherwise use pool
    if api_key:
        extractor = TrafficExtractor(api_key=api_key)
    else:
        extractor = TrafficExtractor(
            api_key=settings.tomtom_api_key,
            key_pool=get_key_pool(),
        )
    raw = extractor.extract(points=points)
    logger.info(f"Extracted {len(raw)} raw responses")

    # T
    transformer = TrafficTransformer(
        segment_keys=kwargs.get("segment_keys"),
        segment_key_map=kwargs.get("segment_key_map"),
        lane_count_map=kwargs.get("lane_count_map"),
    )
    if weather_key_map:
        records = transformer.transform(
            raw,
            weather_key=weather_key,
            weather_key_map=weather_key_map,
        )
    else:
        records = transformer.transform(raw, weather_key=weather_key)
    logger.info(f"Transformed {len(records)} records")

    # L
    loader = TrafficLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_traffic_flow")

    return count
