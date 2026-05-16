"""Shared feature contract for ML models."""

from __future__ import annotations

from typing import Any

DYNAMIC_FEATURE_COLS = [
    "speed_ratio",        # = current_speed / free_flow_speed (tương đối)
    "speed_ratio_delta",  # = thay đổi speed_ratio giữa 2 bước liên tiếp (xu hướng)
    "traffic_index",
    "delay_seconds",
]

STATIC_MODEL_FEATURE_COLS = [
    "time_sin",
    "time_cos",
    "is_peak_hour",
    "is_weekend",
]

STATIC_SCALER_FEATURE_COLS = [
    *STATIC_MODEL_FEATURE_COLS,
]

CATEGORICAL_FEATURE_COLS = [
    "tomtom_frc",
    "weather_key",
    # "shift_code" — BỎ: chỉ có 1 category duy nhất → embedding không học được gì
    "day_of_week",
]

TARGET_COL = "congestion_level"
WINDOW_SIZE_DEFAULT = 12
NUM_CLASSES = 6
WINDOW_STEP_MINUTES = 15

CLASS_MAPPING = {
    0: "Mức 0 (Thông thoáng)",
    1: "Mức 1 (Lưu thông ổn định)",
    2: "Mức 2 (Đông đúc)",
    3: "Mức 3 (Kẹt)",
    4: "Mức 4 (Kẹt nặng)",
    5: "Mức 5 (Vỡ trận)",
}


def get_vocab_sizes(encoders: dict[str, Any]) -> dict[str, int]:
    return {col: len(enc.classes_) for col, enc in encoders.items()}


def get_context_feature_columns() -> list[str]:
    return DYNAMIC_FEATURE_COLS + STATIC_MODEL_FEATURE_COLS + CATEGORICAL_FEATURE_COLS


def ensure_expected_columns(df, required_columns: list[str]) -> None:
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")
