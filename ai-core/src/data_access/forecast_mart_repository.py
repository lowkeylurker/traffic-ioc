"""Forecast mart data access helpers for AI-core owned mart lifecycle."""

from __future__ import annotations

import os
import time
from datetime import timedelta

import pandas as pd
from sqlalchemy import text

from src.core.config import settings
from src.core.database import get_engine

_LAST_MART_REFRESH_AT: dict[str, float] = {}


def _mart_query_timeout_ms() -> int:
    raw = os.getenv("AI_FORECAST_MART_QUERY_TIMEOUT_MS", "180000")
    try:
        return max(1000, int(raw))
    except ValueError:
        return 180000


def _mart_lock_timeout_ms() -> int:
    raw = os.getenv("AI_FORECAST_MART_LOCK_TIMEOUT_MS", "2000")
    try:
        return max(500, int(raw))
    except ValueError:
        return 2000

_MART_DDL = text(
    """
    CREATE TABLE IF NOT EXISTS fact_forecast_segment_mart (
        segment_key BIGINT NOT NULL,
        corridor_key BIGINT NULL,
        date_key INTEGER NOT NULL,
        time_key INTEGER NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        current_speed_kmh DOUBLE PRECISION NULL,
        traffic_index DOUBLE PRECISION NULL,
        delay_seconds DOUBLE PRECISION NULL,
        quality_flag INTEGER NULL,
        congestion_level INTEGER NULL,
        default_lane_count INTEGER NULL,
        free_flow_speed_kmh DOUBLE PRECISION NULL,
        tomtom_frc INTEGER NULL,
        weather_key INTEGER NULL,
        day_of_week TEXT NULL,
        shift_code TEXT NULL,
        is_peak_hour INTEGER NULL,
        is_business_hours INTEGER NULL,
        is_weekend INTEGER NULL,
        speed_ratio DOUBLE PRECISION NULL,
        time_sin DOUBLE PRECISION NULL,
        time_cos DOUBLE PRECISION NULL,
        inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (segment_key, date_key, time_key)
    )
    """
)

_MART_ALTER_DDL = [
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS congestion_level INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS free_flow_speed_kmh DOUBLE PRECISION NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS tomtom_frc INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS weather_key INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS is_peak_hour INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS is_business_hours INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS is_weekend INTEGER NULL",
    "ALTER TABLE fact_forecast_segment_mart ADD COLUMN IF NOT EXISTS speed_ratio DOUBLE PRECISION NULL",
]


def _use_forecast_mart() -> bool:
    return settings.mart.use_forecast_mart


def is_forecast_mart_enabled() -> bool:
    """Public wrapper used by orchestration code."""
    return _use_forecast_mart()


def _enable_mart_self_refresh() -> bool:
    return settings.mart.self_refresh


def _mart_stale_minutes() -> int:
    return max(1, settings.mart.stale_minutes)


def _mart_refresh_cooldown_seconds() -> int:
    return max(0, settings.mart.refresh_cooldown_sec)


def _mart_refresh_lookback_days() -> int:
    return max(0, settings.mart.refresh_lookback_days)


def _segment_refresh_key(segment_ids: list[int]) -> str:
    return ",".join(map(str, sorted({int(seg_id) for seg_id in segment_ids})))


def _ensure_forecast_mart_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(_MART_DDL)
        for statement in _MART_ALTER_DDL:
            conn.execute(text(statement))


def _get_mart_max_timestamp_for_segments(engine, segment_ids: list[int]):
    if not segment_ids:
        return None

    segment_ids_str = _segment_refresh_key(segment_ids)
    query = text(
        f"""
        SELECT MAX(timestamp) AS max_ts
        FROM fact_forecast_segment_mart
        WHERE segment_key IN ({segment_ids_str})
        """
    )

    try:
        with engine.connect() as conn:
            row = conn.execute(query).first()
            return row[0] if row else None
    except Exception:
        return None


def _refresh_forecast_mart_for_segments(engine, segment_ids: list[int], start_date: str, end_date: str) -> bool:
    if not segment_ids:
        return False

    start_ts = pd.to_datetime(start_date)
    end_ts = pd.to_datetime(end_date)
    lookback_days = _mart_refresh_lookback_days()
    refresh_start_ts = start_ts - timedelta(days=lookback_days)
    refresh_end_ts = end_ts
    start_date_key = int(refresh_start_ts.strftime("%Y%m%d"))
    end_date_key = int(refresh_end_ts.strftime("%Y%m%d"))
    segment_ids_str = _segment_refresh_key(segment_ids)

    query = f"""
    INSERT INTO fact_forecast_segment_mart (
        segment_key,
        corridor_key,
        date_key,
        time_key,
        timestamp,
        current_speed_kmh,
        traffic_index,
        delay_seconds,
        quality_flag,
        congestion_level,
        default_lane_count,
        free_flow_speed_kmh,
        tomtom_frc,
        weather_key,
        day_of_week,
        shift_code,
        is_peak_hour,
        is_business_hours,
        is_weekend,
        speed_ratio,
        time_sin,
        time_cos,
        inserted_at
    )
    SELECT DISTINCT ON (f.segment_key, f.date_key, f.time_key)
        f.segment_key,
        bcs.corridor_key,
        f.date_key,
        f.time_key,
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
            WHEN EXTRACT(HOUR FROM f.timestamp) BETWEEN 8 AND 17 THEN 1
            ELSE 0
        END AS is_business_hours,
        CASE
            WHEN EXTRACT(ISODOW FROM f.timestamp) IN (6, 7) THEN 1
            ELSE 0
        END AS is_weekend,
        COALESCE(f.current_speed_kmh / NULLIF(f.free_flow_speed_kmh, 0), 0.0) AS speed_ratio,
        SIN(2 * PI() * (f.time_key::DOUBLE PRECISION / 1440.0)) AS time_sin,
        COS(2 * PI() * (f.time_key::DOUBLE PRECISION / 1440.0)) AS time_cos,
        NOW() AS inserted_at
    FROM fact_traffic_flow f
    LEFT JOIN bridge_corridor_segment bcs ON bcs.segment_key = f.segment_key
    JOIN dim_segment s_dim ON f.segment_key = s_dim.segment_key
    JOIN dim_way w_dim ON s_dim.way_key = w_dim.way_key
    JOIN dim_location loc ON s_dim.location_key = loc.location_key
    JOIN dim_time_of_day d_time ON f.time_key = d_time.time_key
    JOIN dim_date d_date ON f.date_key = d_date.date_key
    LEFT JOIN dim_shift shift ON d_time.default_shift_key = shift.shift_key
    WHERE f.segment_key IN ({segment_ids_str})
            AND COALESCE(f.is_closed, FALSE) = FALSE
      AND f.date_key BETWEEN {start_date_key} AND {end_date_key}
      AND f.timestamp >= '{refresh_start_ts}'
      AND f.timestamp <= '{refresh_end_ts}'
    ORDER BY f.segment_key, f.date_key, f.time_key, bcs.corridor_key
    ON CONFLICT (segment_key, date_key, time_key)
    DO UPDATE SET
        corridor_key = EXCLUDED.corridor_key,
        timestamp = EXCLUDED.timestamp,
        current_speed_kmh = EXCLUDED.current_speed_kmh,
        traffic_index = EXCLUDED.traffic_index,
        delay_seconds = EXCLUDED.delay_seconds,
        quality_flag = EXCLUDED.quality_flag,
        congestion_level = EXCLUDED.congestion_level,
        default_lane_count = EXCLUDED.default_lane_count,
        free_flow_speed_kmh = EXCLUDED.free_flow_speed_kmh,
        tomtom_frc = EXCLUDED.tomtom_frc,
        weather_key = EXCLUDED.weather_key,
        day_of_week = EXCLUDED.day_of_week,
        shift_code = EXCLUDED.shift_code,
        is_peak_hour = EXCLUDED.is_peak_hour,
        is_business_hours = EXCLUDED.is_business_hours,
        is_weekend = EXCLUDED.is_weekend,
        speed_ratio = EXCLUDED.speed_ratio,
        time_sin = EXCLUDED.time_sin,
        time_cos = EXCLUDED.time_cos,
        inserted_at = NOW()
    """

    try:
        _ensure_forecast_mart_table(engine)
        with engine.begin() as conn:
            conn.execute(text(f"SET statement_timeout = {5 * _mart_query_timeout_ms()}"))
            conn.execute(text(f"SET lock_timeout = {5 * _mart_lock_timeout_ms()}"))
            conn.execute(text(query))
        return True
    except Exception as exc:
        print(f"⚠️ Refresh mart cho segments {segment_ids_str} thất bại: {exc}")
        return False


def maybe_refresh_forecast_mart_for_segments(engine, segment_ids: list[int], start_date: str, end_date: str) -> None:
    if not _enable_mart_self_refresh():
        return

    now = time.time()
    refresh_key = _segment_refresh_key(segment_ids)
    cooldown = _mart_refresh_cooldown_seconds()
    last_refresh = _LAST_MART_REFRESH_AT.get(refresh_key, 0.0)
    if now - last_refresh < cooldown:
        return

    max_ts = _get_mart_max_timestamp_for_segments(engine, segment_ids)
    end_ts = pd.to_datetime(end_date)
    stale_threshold = timedelta(minutes=_mart_stale_minutes())
    is_stale = max_ts is None or pd.to_datetime(max_ts) < (end_ts - stale_threshold)

    if not is_stale:
        return

    print(
        f"⚠️ Forecast mart stale cho segments {refresh_key[:80]} (max_ts={max_ts}), "
        "đang self-refresh nhẹ trước khi query..."
    )

    # Optimization: If we already have some data, only refresh from the last known timestamp
    # to avoid re-processing months of data unnecessarily.
    effective_start = start_date
    if max_ts is not None:
        # Start from max_ts - 1 hour to ensure overlap and handle any partial hours
        ts_overlap = pd.to_datetime(max_ts) - timedelta(hours=1)
        # But don't start later than the requested start_date
        if ts_overlap > pd.to_datetime(start_date):
            effective_start = ts_overlap.strftime("%Y-%m-%d %H:%M:%S")

    refreshed = _refresh_forecast_mart_for_segments(
        engine=engine,
        segment_ids=segment_ids,
        start_date=effective_start,
        end_date=end_date,
    )
    if refreshed:
        _LAST_MART_REFRESH_AT[refresh_key] = now
        print(f"✅ Self-refresh mart hoàn tất cho {len(segment_ids)} segments.")


def load_forecast_mart_by_segments(
    engine,
    segment_ids: list[int],
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Load pre-joined model features from forecast mart."""
    segment_ids_str = _segment_refresh_key(segment_ids)

    query = f"""
        SELECT
            segment_key,
            timestamp,
            current_speed_kmh,
            traffic_index,
            delay_seconds,
            quality_flag,
            congestion_level,
            default_lane_count,
            free_flow_speed_kmh,
            tomtom_frc,
            weather_key,
            day_of_week,
            shift_code,
            is_peak_hour,
            is_business_hours,
            is_weekend,
            speed_ratio,
            time_sin,
            time_cos
        FROM fact_forecast_segment_mart
        WHERE segment_key IN ({segment_ids_str})
          AND timestamp >= '{start_date}'
          AND timestamp <= '{end_date}'
        ORDER BY segment_key, timestamp ASC
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(f"SET statement_timeout = {_mart_query_timeout_ms()}"))
            conn.execute(text(f"SET lock_timeout = {_mart_lock_timeout_ms()}"))
            return pd.read_sql_query(text(query), conn)
    except Exception as exc:
        print(f"⚠️ Query forecast mart bị timeout/lỗi ({exc}), chuyển fallback sang warehouse.")
        return pd.DataFrame()
