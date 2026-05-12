"""Smoke tests for the ML dataset layer."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from src.ml.data.dataset import TrafficDataset, prepare_dataloaders
from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
    TARGET_COL,
    WINDOW_SIZE_DEFAULT,
)


def _build_segment_rows(segment_key: int, start_time: datetime, row_count: int) -> list[dict]:
    rows: list[dict] = []
    for index in range(row_count):
        timestamp = start_time + timedelta(minutes=15 * index)
        rows.append(
            {
                "timestamp": timestamp,
                "segment_key": segment_key,
                "current_speed_kmh": 30.0 + index,
                "traffic_index": 0.1 * index,
                "delay_seconds": 5.0 + index,
                "quality_flag": float(index % 2),
                "default_lane_count": 2.0,
                "free_flow_speed_kmh": 45.0,
                "time_sin": 0.5,
                "time_cos": 0.5,
                "is_peak_hour": 1,
                "is_business_hours": 1,
                "is_weekend": 0,
                "tomtom_frc": 3,
                "weather_key": 800,
                "shift_code": 0,
                "day_of_week": 2,
                TARGET_COL: index % 6,
            }
        )
    return rows


def _build_dataset_frame() -> pd.DataFrame:
    rows = []
    rows.extend(_build_segment_rows(1001, datetime(2026, 4, 1, 6, 0), 14))
    rows.extend(_build_segment_rows(1002, datetime(2026, 4, 2, 6, 0), 14))
    return pd.DataFrame(rows)


def test_traffic_dataset_creates_valid_windows() -> None:
    df = _build_dataset_frame()

    dataset = TrafficDataset(df, window_size=WINDOW_SIZE_DEFAULT)

    assert len(dataset) == 4

    x_dynamic, x_static, x_cat, y_target = dataset[0]

    assert x_dynamic.shape == (WINDOW_SIZE_DEFAULT, len(DYNAMIC_FEATURE_COLS))
    assert x_static.shape == (len(STATIC_MODEL_FEATURE_COLS),)
    assert x_cat.shape == (len(CATEGORICAL_FEATURE_COLS),)
    assert y_target.shape == ()


def test_prepare_dataloaders_runs_end_to_end() -> None:
    df = _build_dataset_frame()

    train_loader, val_loader, scaler, encoders = prepare_dataloaders(
        df,
        train_ratio=0.5,
        batch_size=2,
        window_size=WINDOW_SIZE_DEFAULT,
        use_weighted_sampler=False,
    )

    train_batch = next(iter(train_loader))
    val_batch = next(iter(val_loader))

    assert len(train_loader.dataset) == 2
    assert len(val_loader.dataset) == 2
    assert train_batch[0].shape == (2, WINDOW_SIZE_DEFAULT, len(DYNAMIC_FEATURE_COLS))
    assert train_batch[1].shape == (2, len(STATIC_MODEL_FEATURE_COLS))
    assert train_batch[2].shape == (2, len(CATEGORICAL_FEATURE_COLS))
    assert train_batch[3].shape == (2,)
    assert val_batch[0].shape == (2, WINDOW_SIZE_DEFAULT, len(DYNAMIC_FEATURE_COLS))
    assert scaler is not None
    assert set(encoders.keys()) == set(CATEGORICAL_FEATURE_COLS)