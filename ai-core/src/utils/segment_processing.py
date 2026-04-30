"""Segment-level window processing helpers for traffic forecasting."""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.features.temporal_features import create_temporal_features
from src.features.traffic_features import extract_traffic_features
from src.ml.feature_contract import TARGET_COL


def process_single_segment(df_segment: pd.DataFrame, peak_hours_only: bool = True) -> tuple[pd.DataFrame, int]:
    """
    Clean, resample, interpolate, and encode one segment window.
    """
    df_segment['timestamp'] = pd.to_datetime(df_segment['timestamp'])
    df_segment.set_index('timestamp', inplace=True)

    agg_logic = {
        'segment_key': 'first',
        'current_speed_kmh': 'mean',
        'traffic_index': 'mean',
        'delay_seconds': 'mean',
        'quality_flag': 'mean',
        TARGET_COL: 'max',
        'default_lane_count': 'first',
        'free_flow_speed_kmh': 'first',
        'tomtom_frc': 'first',
        'weather_key': 'first',
        'day_of_week': 'first',
        'shift_code': 'first',
        'is_peak_hour': 'max',
        'is_business_hours': 'max',
        'is_weekend': 'max',
        'speed_ratio': 'mean',
    }

    df = df_segment.resample('15min').agg(agg_logic)
    temporal_features = create_temporal_features(df.index)
    df['time_key'] = temporal_features['time_key'].to_numpy()
    df['time_sin'] = temporal_features['time_sin'].to_numpy()
    df['time_cos'] = temporal_features['time_cos'].to_numpy()
    if 'is_peak_hour' not in df.columns:
        df['is_peak_hour'] = temporal_features['is_peak_hour'].astype(int).to_numpy()
    if 'day_of_week' not in df.columns:
        df['day_of_week'] = temporal_features['day_of_week'].astype(str).to_numpy()

    # Keep source congestion_level as training label; do not infer labels from traffic_index.
    df = extract_traffic_features(df, derive_aux_levels=False)

    if 'speed_ratio' not in df.columns:
        df['speed_ratio'] = np.nan

    df['speed_ratio'] = pd.to_numeric(df['speed_ratio'], errors='coerce')

    fallback_speed_ratio = df['current_speed_kmh'] / df['free_flow_speed_kmh'].replace(0, np.nan)
    df['speed_ratio'] = df['speed_ratio'].fillna(fallback_speed_ratio)

    if peak_hours_only:
        df = df.between_time('06:00', '21:00')

    continuous_cols = ['current_speed_kmh', 'traffic_index', 'delay_seconds', 'quality_flag', 'speed_ratio']
    df[continuous_cols] = df[continuous_cols].interpolate(method='linear')

    categorical_cols = ['tomtom_frc', 'weather_key', 'day_of_week', 'shift_code']
    df[categorical_cols] = df[categorical_cols].ffill().bfill()

    static_cols = ['segment_key', 'default_lane_count', 'free_flow_speed_kmh', 'time_sin', 'time_cos', 'is_peak_hour', 'is_business_hours', 'is_weekend']
    df[static_cols] = df[static_cols].ffill().bfill()

    # Keep business/weekend flags consistent with timestamp when source flags are sparse.
    inferred_weekend = (df.index.dayofweek >= 5).astype(int)
    inferred_business = ((df.index.hour >= 8) & (df.index.hour <= 17)).astype(int)
    inferred_peak = (((df.index.hour >= 6) & (df.index.hour <= 10)) | ((df.index.hour >= 16) & (df.index.hour <= 20))).astype(int)
    df['is_peak_hour'] = pd.to_numeric(df['is_peak_hour'], errors='coerce').fillna(pd.Series(inferred_peak, index=df.index))
    df['is_weekend'] = pd.to_numeric(df['is_weekend'], errors='coerce').fillna(pd.Series(inferred_weekend, index=df.index))
    df['is_business_hours'] = pd.to_numeric(df['is_business_hours'], errors='coerce').fillna(pd.Series(inferred_business, index=df.index))

    rows_before_drop = len(df)
    df = df[df[TARGET_COL].notna()].copy()
    dropped_rows = rows_before_drop - len(df)

    df[continuous_cols] = df[continuous_cols].interpolate(method='linear').fillna(0)
    df[categorical_cols] = df[categorical_cols].fillna('unknown')
    df[static_cols] = df[static_cols].fillna(0)
    df[TARGET_COL] = pd.to_numeric(df[TARGET_COL], errors='coerce')

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
            f"⚠️ Tổng hợp làm sạch {TARGET_COL}: "
            f"đã loại bỏ {total_dropped_target_rows} dòng ở {segments_with_dropped_targets} segments."
        )

        top_dropped_segments = sorted(
            segment_drop_stats,
            key=lambda x: (x["drop_ratio_pct"], x["rows_dropped"]),
            reverse=True,
        )[:10]
        if top_dropped_segments:
            print(f"📉 Top segments bị drop {TARGET_COL} cao nhất (theo tỷ lệ):")
            for item in top_dropped_segments:
                print(
                    f"   - Segment {item['segment_key']}: "
                    f"drop {item['rows_dropped']}/{item['rows_before_drop']} "
                    f"({item['drop_ratio_pct']:.2f}%)"
                )

    if empty_after_drop > 0:
        print(f"⚠️ Có {empty_after_drop} segments rỗng sau khi loại bỏ {TARGET_COL} NaN nên đã được bỏ qua.")

    print(f"🚀 Hoàn tất xử lý {len(processed_data)} segments thành công!")
    return processed_data
