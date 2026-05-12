"""Operational error metrics for RL/ML congestion predictions."""

from __future__ import annotations

import numpy as np


def compute_ops_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Compute operationally important metrics.

    Metrics:
    - near_miss_rate: abs error <= 1
    - fatal_5_to_0_rate: true 5 predicted 0
    - fatal_5_to_1_rate: true 5 predicted 1
    - mean_abs_error
    """
    y_true_arr = np.asarray(y_true, dtype=np.int64)
    y_pred_arr = np.asarray(y_pred, dtype=np.int64)

    if y_true_arr.shape != y_pred_arr.shape:
        raise ValueError("y_true and y_pred must have the same shape")
    if y_true_arr.size == 0:
        return {
            "num_samples": 0,
            "near_miss_rate": 0.0,
            "fatal_5_to_0_rate": 0.0,
            "fatal_5_to_1_rate": 0.0,
            "mean_abs_error": 0.0,
        }

    abs_err = np.abs(y_true_arr - y_pred_arr)
    near_miss_rate = float(np.mean(abs_err <= 1))

    true_is_5 = y_true_arr == 5
    denom = int(np.sum(true_is_5))
    if denom > 0:
        fatal_5_to_0_rate = float(np.sum(true_is_5 & (y_pred_arr == 0)) / denom)
        fatal_5_to_1_rate = float(np.sum(true_is_5 & (y_pred_arr == 1)) / denom)
    else:
        fatal_5_to_0_rate = 0.0
        fatal_5_to_1_rate = 0.0

    return {
        "num_samples": int(y_true_arr.size),
        "near_miss_rate": near_miss_rate,
        "fatal_5_to_0_rate": fatal_5_to_0_rate,
        "fatal_5_to_1_rate": fatal_5_to_1_rate,
        "mean_abs_error": float(np.mean(abs_err)),
    }
