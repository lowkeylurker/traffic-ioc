"""Tests for the RL class balancing pipeline."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from src.ml.feature_contract import TARGET_COL
from src.rl.data_balance import (
    ClassBalanceConfig,
    build_balanced_dataset,
    flatten_dynamic_tensor,
    physics_sanity_check,
    reshape_dynamic_tensor,
)


def _build_class_balance_frame() -> pd.DataFrame:
    rows: list[dict] = []
    start = datetime(2026, 4, 1, 6, 0)

    def add_segment(segment_key: int, label: int, base_speed: float, row_count: int = 4) -> None:
        for index in range(row_count):
            timestamp = start + timedelta(minutes=15 * (segment_key * row_count + index))
            temporal = pd.Timestamp(timestamp)
            rows.append(
                {
                    "segment_key": segment_key,
                    "timestamp": timestamp,
                    "current_speed_kmh": base_speed + index,
                    "traffic_index": 0.1 * (label + index),
                    "delay_seconds": 5.0 + index,
                    "quality_flag": float(index % 2),
                    "default_lane_count": 2.0,
                    "free_flow_speed_kmh": 45.0,
                    "time_key": temporal.hour * 60 + temporal.minute,
                    "time_sin": float(np.sin(2 * np.pi * (temporal.hour * 60 + temporal.minute) / 1440)),
                    "time_cos": float(np.cos(2 * np.pi * (temporal.hour * 60 + temporal.minute) / 1440)),
                    "is_peak_hour": 1 if 7 <= temporal.hour <= 9 else 0,
                    "is_business_hours": 1 if 8 <= temporal.hour <= 17 else 0,
                    "is_weekend": 1 if temporal.dayofweek >= 5 else 0,
                    "tomtom_frc": 3,
                    "weather_key": 800,
                    "shift_code": 0,
                    "day_of_week": temporal.dayofweek,
                    TARGET_COL: label,
                }
            )

    add_segment(1, 0, 30.0)
    add_segment(2, 0, 31.0)
    add_segment(3, 0, 32.0)
    add_segment(4, 1, 25.0)
    add_segment(5, 1, 26.0)
    add_segment(6, 1, 27.0)
    add_segment(7, 2, 22.0)
    add_segment(8, 2, 23.0)
    add_segment(9, 2, 24.0)
    add_segment(10, 3, 20.0)
    add_segment(11, 4, 18.0)
    add_segment(12, 5, 16.0)

    return pd.DataFrame(rows)


def test_build_balanced_dataset_exports_parquet(tmp_path: Path) -> None:
    df = _build_class_balance_frame()
    output_path = tmp_path / "balanced.parquet"
    report_path = tmp_path / "balanced.json"

    config = ClassBalanceConfig(
        random_seed=42,
        window_size=4,
        synthetic_rows_class4=8,
        synthetic_rows_class5=8,
        synthetic_noise_pct=0.02,
        use_ctgan=False,
        output_path=str(output_path),
        report_path=str(report_path),
    )

    balanced_df, report = build_balanced_dataset(df, config=config, output_path=output_path, report_path=report_path)

    assert output_path.exists()
    assert report_path.exists()
    assert report.applied is True
    assert report.after_counts[3] == report.before_counts[3]
    assert report.after_counts[0] <= report.before_counts[0]
    assert report.after_counts[1] <= report.before_counts[1]
    assert report.after_counts[2] <= report.before_counts[2]
    assert "synthetic_flag" in balanced_df.columns
    assert int(balanced_df["synthetic_flag"].sum()) > 0

    loaded = pd.read_parquet(output_path)
    assert len(loaded) == len(balanced_df)
    assert set(loaded[TARGET_COL].unique()).issubset(set(range(6)))


def test_physics_sanity_check_filters_invalid_rows() -> None:
    df = pd.DataFrame(
        {
            "segment_key": [1, 1, 1],
            "timestamp": pd.date_range("2026-04-01", periods=3, freq="15min"),
            "current_speed_kmh": [30.0, -5.0, 20.0],
            "traffic_volume": [100.0, 100.0, -1.0],
            "traffic_density": [1.0, 1.0, 0.0],
            TARGET_COL: [4, 4, 4],
        }
    )

    filtered, stats = physics_sanity_check(df)

    assert len(filtered) == 1
    assert stats["removed_negative_speed"] >= 1
    assert stats["removed_negative_volume"] >= 1


def test_tensor_flatten_roundtrip() -> None:
    tensor = np.arange(60, dtype=np.float32).reshape(12, 5)
    df = pd.DataFrame({"segment_key": [1], "dynamic": [tensor], "timestamp": [pd.Timestamp("2026-04-01")]})

    flattened = flatten_dynamic_tensor(df)
    restored = reshape_dynamic_tensor(flattened)

    assert "dynamic" not in flattened.columns
    assert "dynamic" in restored.columns
    np.testing.assert_allclose(restored.iloc[0]["dynamic"], tensor)
