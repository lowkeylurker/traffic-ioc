"""Segment-level window processing helpers for traffic forecasting."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.features.temporal_features import create_temporal_features
from src.features.traffic_features import extract_traffic_features


def process_single_segment(df_segment: pd.DataFrame, peak_hours_only: bool = True) -> tuple[pd.DataFrame, int]:
    """
    Clean, resample, interpolate, and encode one segment window.
    """
    df_segment['timestamp'] = pd.to_datetime(df_segment['timestamp'])
    df_segment.set_index('timestamp', inplace=True)

    agg_logic = {
        'segment_key': 'first',
        'current_speed_kmh': 'mean',
        'pcu_volume': 'mean',
        'traffic_index': 'mean',
        'delay_seconds': 'mean',
        'quality_flag': 'mean',
        'target_label': 'max',
        'default_lane_count': 'first',
        'static_free_flow': 'first',
        'osm_highway_type': 'first',
        'district': 'first',
        'day_of_week': 'first',
        'shift_code': 'first',
        'weather_severity': 'max',
    }

    df = df_segment.resample('15min').agg(agg_logic)
    temporal_features = create_temporal_features(df.index)
    df['time_key'] = temporal_features['time_key'].to_numpy()
    df['time_sin'] = temporal_features['time_sin'].to_numpy()
    df['time_cos'] = temporal_features['time_cos'].to_numpy()
    if 'day_of_week' not in df.columns:
        df['day_of_week'] = temporal_features['day_of_week'].astype(str).to_numpy()

    df = extract_traffic_features(df)

    if peak_hours_only:
        df = df.between_time('06:00', '21:00')

    continuous_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')

    categorical_cols = ['osm_highway_type', 'district', 'day_of_week', 'shift_code']
    df[categorical_cols] = df[categorical_cols].ffill().bfill()
    df['weather_severity'] = df['weather_severity'].ffill().bfill()

    static_cols = ['segment_key', 'default_lane_count', 'static_free_flow', 'time_sin', 'time_cos']
    df[static_cols] = df[static_cols].ffill().bfill()

    rows_before_drop = len(df)
    df = df[df['target_label'].notna()].copy()
    dropped_rows = rows_before_drop - len(df)

    df[continuous_cols] = df[continuous_cols].interpolate(method='linear').fillna(0)
    df[categorical_cols] = df[categorical_cols].fillna('unknown')
    df[static_cols] = df[static_cols].fillna(0)
    df['weather_severity'] = df['weather_severity'].fillna(0)

    df.reset_index(inplace=True)
    df['segment_key'] = df['segment_key'].astype(np.int64)
    return df, dropped_rows


def process_bulk_dataframe(
    df_bulk: pd.DataFrame,
    peak_hours_only: bool = True,
    source_label: str = "bulk",
) -> dict:
    if df_bulk.empty:
        print("⚠️ Không có dữ liệu nào trong khoảng thời gian này.")
        return {}

    print(f"✅ Đã tải xong {len(df_bulk)} dòng dữ liệu thô từ {source_label}. Đang tiến hành xử lý...")

    processed_data: dict = {}
    total_dropped_target_rows = 0
    segments_with_dropped_targets = 0
    empty_after_drop = 0
    segment_drop_stats = []

    for seg_id, group_df in df_bulk.groupby("segment_key"):
        try:
            processed_df, dropped_rows = process_single_segment(group_df.copy(), peak_hours_only)
            if dropped_rows > 0:
                total_dropped_target_rows += dropped_rows
                segments_with_dropped_targets += 1

            total_rows_before_drop = len(processed_df) + dropped_rows
            drop_ratio_pct = (dropped_rows / total_rows_before_drop * 100.0) if total_rows_before_drop > 0 else 0.0
            segment_drop_stats.append(
                {
                    "segment_key": int(seg_id),
                    "rows_before_drop": int(total_rows_before_drop),
                    "rows_dropped": int(dropped_rows),
                    "drop_ratio_pct": float(drop_ratio_pct),
                }
            )

            if processed_df.empty:
                empty_after_drop += 1
                continue

            processed_data[seg_id] = processed_df
        except Exception as e:
            print(f"⚠️ Bỏ qua Segment {seg_id} do lỗi xử lý dữ liệu: {e}")

    if total_dropped_target_rows > 0:
        print(
            "⚠️ Tổng hợp làm sạch target_label: "
            f"đã loại bỏ {total_dropped_target_rows} dòng ở {segments_with_dropped_targets} segments."
        )

        top_dropped_segments = sorted(
            segment_drop_stats,
            key=lambda x: (x["drop_ratio_pct"], x["rows_dropped"]),
            reverse=True,
        )[:10]
        if top_dropped_segments:
            print("📉 Top segments bị drop target_label cao nhất (theo tỷ lệ):")
            for item in top_dropped_segments:
                print(
                    f"   - Segment {item['segment_key']}: "
                    f"drop {item['rows_dropped']}/{item['rows_before_drop']} "
                    f"({item['drop_ratio_pct']:.2f}%)"
                )

    if empty_after_drop > 0:
        print(f"⚠️ Có {empty_after_drop} segments rỗng sau khi loại bỏ target_label NaN nên đã được bỏ qua.")

    print(f"🚀 Hoàn tất xử lý {len(processed_data)} segments thành công!")
    return processed_data
