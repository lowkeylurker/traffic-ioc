"""Precision-Recall metrics for rare congestion classes."""

from __future__ import annotations

from typing import Iterable

import numpy as np
from sklearn.metrics import average_precision_score


def compute_pr_metrics_for_rare_classes(
    y_true: np.ndarray,
    y_score_by_class: dict[int, np.ndarray],
    rare_classes: Iterable[int] = (4, 5),
) -> dict:
    """Compute AP for selected rare classes in one-vs-rest style.

    Parameters:
    - y_true: integer labels
    - y_score_by_class: mapping class_id -> score array aligned with y_true
    - rare_classes: classes to evaluate
    """
    y_true_arr = np.asarray(y_true, dtype=np.int64)
    if y_true_arr.size == 0:
        return {"num_samples": 0, "classes": {}}

    classes_payload: dict[str, dict[str, float]] = {}
    for cls in rare_classes:
        if cls not in y_score_by_class:
            continue
        cls_scores = np.asarray(y_score_by_class[cls], dtype=np.float64)
        if cls_scores.shape[0] != y_true_arr.shape[0]:
            raise ValueError(f"Score length mismatch for class {cls}")

        binary_true = (y_true_arr == int(cls)).astype(np.int64)
        ap = average_precision_score(binary_true, cls_scores)
        prevalence = float(np.mean(binary_true))
        classes_payload[f"class_{int(cls)}"] = {
            "average_precision": float(ap),
            "prevalence": prevalence,
        }

    return {
        "num_samples": int(y_true_arr.size),
        "classes": classes_payload,
    }
