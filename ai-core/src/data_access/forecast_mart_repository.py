"""Forecast mart data access helpers for AI-core owned mart lifecycle."""

from __future__ import annotations

import os
import time
from datetime import timedelta

import pandas as pd
from sqlalchemy import text

from src.core.database import get_engine

_LAST_MART_REFRESH_AT: dict[str, float] = {}

_MART_DDL = text(
    """
    CREATE TABLE IF NOT EXISTS fact_forecast_segment_mart (
        segment_key BIGINT NOT NULL,
        corridor_key BIGINT NULL,
        date_key INTEGER NOT NULL,
        time_key INTEGER NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        current_speed_kmh DOUBLE PRECISION NULL,
        pcu_volume DOUBLE PRECISION NULL,
        traffic_index DOUBLE PRECISION NULL,
        delay_seconds DOUBLE PRECISION NULL,
        quality_flag INTEGER NULL,
        target_label INTEGER NULL,
        default_lane_count INTEGER NULL,
        static_free_flow DOUBLE PRECISION NULL,
        osm_highway_type TEXT NULL,
        district TEXT NULL,
        day_of_week TEXT NULL,
        shift_code TEXT NULL,
        weather_severity INTEGER NULL,
        time_sin DOUBLE PRECISION NULL,
        time_cos DOUBLE PRECISION NULL,
        inserted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (segment_key, date_key, time_key)
    )
    """
)


def _use_forecast_mart() -> bool:
    raw = os.getenv("AI_USE_FORECAST_MART", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def is_forecast_mart_enabled() -> bool:
    """Public wrapper used by orchestration code."""
    return _use_forecast_mart()


def _enable_mart_self_refresh() -> bool:
    raw = os.getenv("AI_FORECAST_MART_SELF_REFRESH", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _mart_stale_minutes() -> int:
    try:
        return max(1, int(os.getenv("AI_FORECAST_MART_STALE_MINUTES", "15")))
    except ValueError:
        return 15


def _mart_refresh_cooldown_seconds() -> int:
    try:
        return max(0, int(os.getenv("AI_FORECAST_MART_REFRESH_COOLDOWN_SEC", "180")))
    except ValueError:
        return 180


def _mart_refresh_lookback_days() -> int:
    try:
        return max(0, int(os.getenv("AI_FORECAST_MART_REFRESH_LOOKBACK_DAYS", "1")))
    except ValueError:
        return 1


def _segment_refresh_key(segment_ids: list[int]) -> str:
    return ",".join(map(str, sorted({int(seg_id) for seg_id in segment_ids})))


def _ensure_forecast_mart_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(_MART_DDL)


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
        pcu_volume,
        traffic_index,
        delay_seconds,
        quality_flag,
        target_label,
        default_lane_count,
        static_free_flow,
        osm_highway_type,
        district,
        day_of_week,
        shift_code,
        weather_severity,
        time_sin,
        time_cos,
        inserted_at
    )
    SELECT
        f.segment_key,
        bcs.corridor_key,
        f.date_key,
        f.time_key,
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
        w_weather.severity_level AS weather_severity,
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
    LEFT JOIN dim_weather w_weather ON f.weather_key = w_weather.weather_key
    WHERE f.segment_key IN ({segment_ids_str})
      AND f.date_key BETWEEN {start_date_key} AND {end_date_key}
      AND f.timestamp >= '{refresh_start_ts}'
      AND f.timestamp <= '{refresh_end_ts}'
    ON CONFLICT (segment_key, date_key, time_key)
    DO UPDATE SET
        corridor_key = EXCLUDED.corridor_key,
        timestamp = EXCLUDED.timestamp,
        current_speed_kmh = EXCLUDED.current_speed_kmh,
        pcu_volume = EXCLUDED.pcu_volume,
        traffic_index = EXCLUDED.traffic_index,
        delay_seconds = EXCLUDED.delay_seconds,
        quality_flag = EXCLUDED.quality_flag,
        target_label = EXCLUDED.target_label,
        default_lane_count = EXCLUDED.default_lane_count,
        static_free_flow = EXCLUDED.static_free_flow,
        osm_highway_type = EXCLUDED.osm_highway_type,
        district = EXCLUDED.district,
        day_of_week = EXCLUDED.day_of_week,
        shift_code = EXCLUDED.shift_code,
        weather_severity = EXCLUDED.weather_severity,
        time_sin = EXCLUDED.time_sin,
        time_cos = EXCLUDED.time_cos,
        inserted_at = NOW()
    """

    try:
        with engine.begin() as conn:
            conn.execute(_MART_DDL)
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
    refreshed = _refresh_forecast_mart_for_segments(
        engine=engine,
        segment_ids=segment_ids,
        start_date=start_date,
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
    _ensure_forecast_mart_table(engine)
    segment_ids_str = _segment_refresh_key(segment_ids)

    query = f"""
        SELECT
            segment_key,
            timestamp,
            current_speed_kmh,
            pcu_volume,
            traffic_index,
            delay_seconds,
            quality_flag,
            target_label,
            default_lane_count,
            static_free_flow,
            osm_highway_type,
            district,
            day_of_week,
            shift_code,
            weather_severity
        FROM fact_forecast_segment_mart
        WHERE segment_key IN ({segment_ids_str})
          AND timestamp >= '{start_date}'
          AND timestamp <= '{end_date}'
        ORDER BY segment_key, timestamp ASC
    """
    return pd.read_sql_query(query, engine)
