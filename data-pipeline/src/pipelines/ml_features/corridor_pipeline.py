"""Corridor Performance Pipeline (Nightly Batch).

Aggregate fact_traffic_flow data per corridor → fact_corridor_performance.
Pre-condition: dim_corridor + bridge_corridor_segment đã setup.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from src.core.logger import get_logger
from src.domain.math import TZ_HCM, derive_date_key
from src.domain.math.key_generator import generate_corridor_perf_key
from src.pipelines.base import BaseLoader, BaseTransformer


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class CorridorTransformer(BaseTransformer):
    """Transform aggregated corridor data → fact_corridor_performance rows."""

    def transform(self, raw_data: list[dict]) -> list[dict]:
        """raw_data = rows from corridor aggregation query.

        Each row:
            corridor_key, time_key, date_key, avg_speed,
            total_delay, travel_time_index, bottleneck_seg_key, corridor_version,
            incident_count
        """
        records = []
        # Keep DB TIMESTAMP values aligned with Asia/Ho_Chi_Minh local time.
        now = datetime.now(tz=TZ_HCM).replace(tzinfo=None)

        for row in raw_data:
            avg_speed = float(row.get("avg_speed", 0))
            total_delay = int(row.get("total_delay", 0))
            tti = float(row.get("travel_time_index", 1.0))

            # Corridor efficiency = 1 / TTI (capped at 1.0)
            efficiency = round(min(1.0, 1.0 / tti) if tti > 0 else 0.0, 2)

            # Generate unique key
            ck = int(row["corridor_key"])
            dk = int(row["date_key"])
            tk = int(row["time_key"])
            cv = int(row.get("corridor_version", 1) or 1)
            perf_key = generate_corridor_perf_key(ck, dk, tk, cv)

            records.append(
                {
                    "corridor_perf_key": perf_key,
                    "corridor_key": ck,
                    "corridor_version": cv,
                    "time_key": tk,
                    "date_key": dk,
                    "bottleneck_seg_key": row.get("bottleneck_seg_key"),
                    "timestamp": now,
                    "avg_corridor_speed": round(avg_speed, 2),
                    "total_delay_seconds": total_delay,
                    "travel_time_index": round(tti, 2),
                    "corridor_efficiency": efficiency,
                    "active_incident_count": int(row.get("incident_count", 0)),
                    "inserted_at": now,
                    "quality_flag": 5,
                }
            )

        self.logger.info(
            f"Transformed {len(records)} corridor performance records"
        )
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class CorridorPerformanceLoader(BaseLoader):
    TABLE_NAME = "fact_corridor_performance"
    CONFLICT_KEYS = ["corridor_perf_key"]
    UPDATE_COLUMNS = [
        "avg_corridor_speed",
        "total_delay_seconds",
        "travel_time_index",
        "corridor_efficiency",
        "active_incident_count",
        "corridor_version",
        "inserted_at",
    ]
    BATCH_SIZE = 200

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════

_CORRIDOR_QUERY = text("""
        WITH active_corridors AS (
            SELECT corridor_key,
                   COALESCE(corridor_version, 1) AS corridor_version
            FROM dim_corridor
            WHERE corridor_version = (SELECT COALESCE(MAX(corridor_version), 1) FROM dim_corridor)
        ),
        latest_time AS (
            SELECT MAX(f.time_key) AS time_key
            FROM fact_traffic_flow f
            JOIN bridge_corridor_segment bcs ON f.segment_key = bcs.segment_key
            JOIN active_corridors ac ON ac.corridor_key = bcs.corridor_key
            WHERE f.date_key = :target_date_key
        )
    SELECT
        bcs.corridor_key,
        ac.corridor_version,
        f.time_key,
        f.date_key,
        AVG(f.current_speed_kmh)        AS avg_speed,
        SUM(f.delay_seconds)            AS total_delay,
        AVG(CASE WHEN f.free_flow_speed_kmh > 0
            THEN f.free_flow_speed_kmh / NULLIF(f.current_speed_kmh, 0)
            ELSE 1.0 END)               AS travel_time_index,
        (SELECT s.segment_key
         FROM fact_traffic_flow s
         JOIN bridge_corridor_segment bcs2 ON s.segment_key = bcs2.segment_key
         WHERE bcs2.corridor_key = bcs.corridor_key
           AND s.date_key = f.date_key AND s.time_key = f.time_key
         ORDER BY s.delay_seconds DESC NULLS LAST
         LIMIT 1)                       AS bottleneck_seg_key,
        COALESCE((SELECT COUNT(*)
         FROM fact_incident i
         JOIN bridge_corridor_segment bcs3 ON i.segment_key = bcs3.segment_key
         WHERE bcs3.corridor_key = bcs.corridor_key
           AND i.date_key = f.date_key AND i.is_active = TRUE), 0) AS incident_count
    FROM fact_traffic_flow f
    JOIN bridge_corridor_segment bcs ON f.segment_key = bcs.segment_key
    JOIN active_corridors ac ON ac.corridor_key = bcs.corridor_key
        WHERE f.date_key = :target_date_key
            AND f.time_key = (SELECT lt.time_key FROM latest_time lt)
    GROUP BY bcs.corridor_key, ac.corridor_version, f.time_key, f.date_key
""")


def run(engine: Engine, **kwargs) -> int:
    """Aggregate corridor performance cho 1 ngày.

    Kwargs:
        target_date_key: int – ngày cần tính (default: hôm nay).
        bbox: dict – bounding box cho target district (default: Q1).

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("corridor_pipeline")

    target_dk = kwargs.get("target_date_key", derive_date_key())

    with Session(engine) as session:
        result = session.execute(
            _CORRIDOR_QUERY,
            {
                "target_date_key": target_dk,
            },
        )
        rows = [dict(r._mapping) for r in result]

    distinct_corridors = len({int(r["corridor_key"]) for r in rows}) if rows else 0
    logger.info(
        "Queried %s corridor aggregation rows for date_key=%s (distinct_corridors=%s)",
        len(rows),
        target_dk,
        distinct_corridors,
    )

    if not rows:
        logger.warning("No corridor data found")
        return 0

    transformer = CorridorTransformer()
    records = transformer.transform(rows)

    loader = CorridorPerformanceLoader(engine=engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → fact_corridor_performance")

    return count
