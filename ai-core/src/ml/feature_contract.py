"""Shared feature contract for ML models."""

from __future__ import annotations

from typing import Any

DYNAMIC_FEATURE_COLS = [
    "current_speed_kmh",
    "pcu_volume",
    "traffic_index",
    "delay_seconds",
    "quality_flag",
]

STATIC_MODEL_FEATURE_COLS = [
    "default_lane_count",
    "static_free_flow",
    "time_sin",
    "time_cos",
    "weather_severity",
]

STATIC_SCALER_FEATURE_COLS = [
    "default_lane_count",
    "static_free_flow",
    "weather_severity",
]

CATEGORICAL_FEATURE_COLS = [
    "osm_highway_type",
    "district",
    "shift_code",
    "day_of_week",
]

TARGET_COL = "target_label"
WINDOW_SIZE_DEFAULT = 12
NUM_CLASSES = 4
WINDOW_STEP_MINUTES = 15

CLASS_MAPPING = {
    0: "A - Thông thoáng",
    1: "B - Lưu thông ổn định",
    2: "C - Đông đúc",
    3: "D - Ùn tắc cao",
}


def get_vocab_sizes(encoders: dict[str, Any]) -> dict[str, int]:
    return {col: len(enc.classes_) for col, enc in encoders.items()}


def get_context_feature_columns() -> list[str]:
    return DYNAMIC_FEATURE_COLS + STATIC_MODEL_FEATURE_COLS + CATEGORICAL_FEATURE_COLS


def ensure_expected_columns(df, required_columns: list[str]) -> None:
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")
