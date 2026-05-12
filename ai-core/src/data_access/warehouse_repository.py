"""Warehouse-side data access helpers for traffic forecasting."""

from __future__ import annotations

import os
import pandas as pd

from sqlalchemy import text

from src.core.database import get_engine


def _warehouse_query_timeout_ms() -> int:
    raw = os.getenv("AI_WAREHOUSE_QUERY_TIMEOUT_MS", "180000")
    try:
        return max(5000, int(raw))
    except ValueError:
        return 180000


def get_segments_in_corridor(corridor_id: int) -> list[int]:
    """Return all segment ids mapped to a corridor."""
    engine = get_engine()
    query = text(
        """
        SELECT DISTINCT ftf.segment_key
        FROM fact_traffic_flow ftf
        LEFT JOIN bridge_corridor_segment bcs ON ftf.segment_key = bcs.segment_key
        WHERE bcs.corridor_key = :corridor_id
        """
    )
    df = pd.read_sql_query(query, engine, params={"corridor_id": corridor_id})
    return [int(segment_key) for segment_key in df["segment_key"].tolist()]


def get_corridors_by_segment(segment_id: int) -> list[int]:
    """Return corridor ids mapped to a segment."""
    engine = get_engine()
    query = text(
        """
        SELECT DISTINCT bcs.corridor_key
        FROM bridge_corridor_segment bcs
        WHERE bcs.segment_key = :segment_id
        ORDER BY bcs.corridor_key
        """
    )
    df = pd.read_sql_query(query, engine, params={"segment_id": int(segment_id)})
    if df.empty:
        return []
    return [int(corridor_key) for corridor_key in df["corridor_key"].tolist()]


def get_nearest_segments_in_corridor(
    segment_id: int,
    corridor_id: int,
    limit: int = 8,
) -> list[tuple[int, float]]:
    """Return nearest candidate segments in the same corridor with available traffic facts."""
    engine = get_engine()
    query = text(
        """
        SELECT
            cand.segment_key AS candidate_segment_id,
            ST_Distance(src.geometry_center::geography, cand.geometry_center::geography) AS distance_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment cand ON cand.segment_key = bcs.segment_key
        JOIN dim_segment src ON src.segment_key = :segment_id
        WHERE bcs.corridor_key = :corridor_id
          AND bcs.segment_key <> :segment_id
          AND src.geometry_center IS NOT NULL
          AND cand.geometry_center IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM fact_traffic_flow f
              WHERE f.segment_key = bcs.segment_key
              LIMIT 1
          )
        ORDER BY distance_m ASC
        LIMIT :limit
        """
    )
    df = pd.read_sql_query(
        query,
        engine,
        params={
            "segment_id": int(segment_id),
            "corridor_id": int(corridor_id),
            "limit": int(limit),
        },
    )
    if df.empty:
        return []
    return [
        (int(row["candidate_segment_id"]), float(row["distance_m"]))
        for _, row in df.iterrows()
    ]


def get_nearest_segments_global(
    segment_id: int,
    limit: int = 8,
) -> list[tuple[int, float]]:
    """Return nearest candidate segments across the entire network based on GPS distance."""
    engine = get_engine()
    query = text(
        """
        SELECT
            cand.segment_key AS candidate_segment_id,
            ST_Distance(src.geometry_center::geography, cand.geometry_center::geography) AS distance_m
        FROM dim_segment cand
        JOIN dim_segment src ON src.segment_key = :segment_id
        WHERE cand.segment_key <> :segment_id
          AND src.geometry_center IS NOT NULL
          AND cand.geometry_center IS NOT NULL
          AND EXISTS (
              SELECT 1
              FROM fact_traffic_flow f
              WHERE f.segment_key = cand.segment_key
              LIMIT 1
          )
        ORDER BY distance_m ASC
        LIMIT :limit
        """
    )
    df = pd.read_sql_query(
        query,
        engine,
        params={
            "segment_id": int(segment_id),
            "limit": int(limit),
        },
    )
    if df.empty:
        return []
    return [
        (int(row["candidate_segment_id"]), float(row["distance_m"]))
        for _, row in df.iterrows()
    ]


def get_benchmark_segment_pool(limit: int = 5000) -> list[int]:
    """Return a real segment pool from warehouse traffic facts for benchmark sampling."""
    engine = get_engine()
    query = text(
        """
        SELECT DISTINCT f.segment_key
        FROM fact_traffic_flow f
        WHERE f.segment_key IS NOT NULL
        ORDER BY f.segment_key
        LIMIT :limit
        """
    )
    df = pd.read_sql_query(query, engine, params={"limit": int(limit)})
    if df.empty:
        return []
    return [int(segment_key) for segment_key in df["segment_key"].tolist()]


def load_warehouse_rows_by_segments(
    segment_ids: list[int],
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Load raw feature rows from warehouse for a list of segment ids."""
    if not segment_ids:
        return pd.DataFrame()

    segment_ids_sql = ",".join(map(str, segment_ids))
    query = f"""
        SELECT
            f.segment_key,
            f.timestamp,
            f.current_speed_kmh,
            f.traffic_index,
            f.delay_seconds,
            f.quality_flag,
            f.congestion_level,
            w_dim.default_lane_count,
            f.free_flow_speed_kmh,
            COALESCE(w_dim.tomtom_frc, 6) AS tomtom_frc,
            f.weather_key,
            d_date.day_of_week,
            shift.shift_code,
                        CASE
                                WHEN EXTRACT(HOUR FROM f.timestamp) BETWEEN 6 AND 10
                                    OR EXTRACT(HOUR FROM f.timestamp) BETWEEN 16 AND 20 THEN 1
                                ELSE 0
                        END AS is_peak_hour,
            CASE
                WHEN EXTRACT(ISODOW FROM f.timestamp) IN (6, 7) THEN 1
                ELSE 0
            END AS is_weekend,
            CASE
                WHEN EXTRACT(HOUR FROM f.timestamp) BETWEEN 8 AND 17 THEN 1
                ELSE 0
            END AS is_business_hours
        FROM fact_traffic_flow f
        JOIN dim_segment s_dim ON f.segment_key = s_dim.segment_key
        JOIN dim_way w_dim ON s_dim.way_key = w_dim.way_key
        JOIN dim_location loc ON s_dim.location_key = loc.location_key
        JOIN dim_time_of_day d_time ON f.time_key = d_time.time_key
        JOIN dim_date d_date ON f.date_key = d_date.date_key
        LEFT JOIN dim_shift shift ON d_time.default_shift_key = shift.shift_key
        WHERE f.segment_key IN ({segment_ids_sql})
          AND COALESCE(f.is_closed, FALSE) = FALSE
          AND f.timestamp >= '{start_date}'
          AND f.timestamp <= '{end_date}'
        ORDER BY f.segment_key, f.timestamp ASC;
    """
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text(f"SET statement_timeout = {_warehouse_query_timeout_ms()}"))
        return pd.read_sql_query(text(query), conn)
