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
from src.domain.geo.constants import BBOX_DISTRICT_1
from src.domain.math import TZ_HCM, derive_date_key
from src.domain.math.key_generator import generate_traffic_flow_key
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
            total_delay, travel_time_index, bottleneck_seg_key,
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
            perf_key = generate_traffic_flow_key(ck, dk, tk)

            records.append(
                {
                    "corridor_perf_key": perf_key,
                    "corridor_key": ck,
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
        "inserted_at",
    ]
    BATCH_SIZE = 200

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════

_CORRIDOR_QUERY = text("""
        WITH q1_boundary AS (
                SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
                FROM dim_location dl
                WHERE dl.geometry_polygon IS NOT NULL
                    AND (
                        LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
                    OR LOWER(TRIM(dl.district)) LIKE '%quan 1%'
                    )
        ),
        all_corridor_segments AS (
            SELECT bcs.corridor_key,
                   COUNT(*) AS total_segments,
                   SUM(ds.length_m) AS total_length_m
            FROM bridge_corridor_segment bcs
            JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
            WHERE ds.geometry_center IS NOT NULL
            GROUP BY bcs.corridor_key
        ),
        q1_corridor_segments AS (
            SELECT bcs.corridor_key,
                   COUNT(*) AS q1_segments,
                   SUM(ds.length_m) AS q1_length_m,
                   MIN(
                   CASE
                       WHEN qb.geom IS NOT NULL THEN ST_Distance(ds.geometry_center::geography, qb.geom::geography)
                       ELSE 0
                   END
                   ) AS min_dist_to_q1_m
            FROM bridge_corridor_segment bcs
            JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
            CROSS JOIN q1_boundary qb
            WHERE ds.geometry_center IS NOT NULL
              AND (
                    (qb.geom IS NOT NULL AND ST_DWithin(ds.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
                 OR (
                        qb.geom IS NULL
                    AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                    AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                 )
                )
            GROUP BY bcs.corridor_key
        ),
        selected_corridors AS (
            SELECT acs.corridor_key
            FROM all_corridor_segments acs
            JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
            WHERE (qcs.q1_length_m / acs.total_length_m >= :q1_main_threshold)
               OR (
                qcs.q1_length_m / acs.total_length_m >= :q1_gateway_threshold
                AND qcs.min_dist_to_q1_m <= :gateway_distance_m
               )
        ),
        etl_segments AS (
            SELECT DISTINCT
                   s.segment_key,
                   bcs.corridor_key
            FROM dim_segment s
            JOIN dim_way w ON s.way_key = w.way_key
            JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
            JOIN selected_corridors sc ON sc.corridor_key = bcs.corridor_key
            CROSS JOIN q1_boundary qb
            WHERE s.geometry_center IS NOT NULL
              AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
              AND (
                    (qb.geom IS NOT NULL AND ST_DWithin(s.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
                 OR (
                        qb.geom IS NULL
                    AND ST_X(s.geometry_center) BETWEEN :min_lon AND :max_lon
                    AND ST_Y(s.geometry_center) BETWEEN :min_lat AND :max_lat
                 )
                )
        ),
        target_corridors AS (
            SELECT DISTINCT es.corridor_key
            FROM etl_segments es
        ),
        latest_time AS (
            SELECT MAX(f.time_key) AS time_key
            FROM fact_traffic_flow f
            JOIN bridge_corridor_segment bcs ON f.segment_key = bcs.segment_key
            JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
            WHERE f.date_key = :target_date_key
        )
    SELECT
        bcs.corridor_key,
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
    JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
        WHERE f.date_key = :target_date_key
            AND f.time_key = (SELECT lt.time_key FROM latest_time lt)
    GROUP BY bcs.corridor_key, f.time_key, f.date_key
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
    bbox = kwargs.get("bbox", BBOX_DISTRICT_1)

    with Session(engine) as session:
        result = session.execute(
            _CORRIDOR_QUERY,
            {
                "target_date_key": target_dk,
                "min_lon": bbox["min_lon"],
                "min_lat": bbox["min_lat"],
                "max_lon": bbox["max_lon"],
                "max_lat": bbox["max_lat"],
                "q1_main_threshold": kwargs.get("q1_main_threshold", 0.40),
                "q1_gateway_threshold": kwargs.get("q1_gateway_threshold", 0.15),
                "gateway_distance_m": kwargs.get("gateway_distance_m", 1500),
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
