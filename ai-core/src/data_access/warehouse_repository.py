"""Warehouse-side data access helpers for traffic forecasting."""

from __future__ import annotations

import pandas as pd

from sqlalchemy import text

from src.core.database import get_engine


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
            f.pcu_volume,
            f.traffic_index,
            f.delay_seconds,
            f.quality_flag,
            f.congestion_level AS target_label,
            w_dim.default_lane_count,
            f.free_flow_speed_kmh AS static_free_flow,
            w_dim.osm_highway_type,
            loc.district,
            d_date.day_of_week,
            shift.shift_code,
            w_weather.severity_level AS weather_severity
        FROM fact_traffic_flow f
        JOIN dim_segment s_dim ON f.segment_key = s_dim.segment_key
        JOIN dim_way w_dim ON s_dim.way_key = w_dim.way_key
        JOIN dim_location loc ON s_dim.location_key = loc.location_key
        JOIN dim_time_of_day d_time ON f.time_key = d_time.time_key
        JOIN dim_date d_date ON f.date_key = d_date.date_key
        LEFT JOIN dim_shift shift ON d_time.default_shift_key = shift.shift_key
        LEFT JOIN dim_weather w_weather ON f.weather_key = w_weather.weather_key
        WHERE f.segment_key IN ({segment_ids_sql})
          AND f.timestamp >= '{start_date}'
          AND f.timestamp <= '{end_date}'
        ORDER BY f.segment_key, f.timestamp ASC;
    """
    return pd.read_sql_query(query, get_engine())
