from __future__ import annotations

import numpy as np

from src.rl.evaluation import (
    build_evaluation_report_markdown,
    compute_ops_metrics,
    compute_pr_metrics_for_rare_classes,
)


def test_compute_ops_metrics_basic() -> None:
    y_true = np.array([5, 5, 4, 3, 2, 1, 0], dtype=np.int64)
    y_pred = np.array([1, 0, 4, 2, 2, 2, 0], dtype=np.int64)

    result = compute_ops_metrics(y_true, y_pred)

    assert result["num_samples"] == 7
    assert 0.0 <= result["near_miss_rate"] <= 1.0
    assert result["fatal_5_to_0_rate"] > 0.0
    assert result["fatal_5_to_1_rate"] > 0.0


def test_compute_pr_metrics_for_rare_classes_basic() -> None:
    y_true = np.array([0, 4, 5, 4, 1, 5], dtype=np.int64)
    score_4 = np.array([0.1, 0.8, 0.2, 0.7, 0.1, 0.2], dtype=np.float64)
    score_5 = np.array([0.1, 0.1, 0.9, 0.2, 0.2, 0.85], dtype=np.float64)

    result = compute_pr_metrics_for_rare_classes(
        y_true=y_true,
        y_score_by_class={4: score_4, 5: score_5},
        rare_classes=(4, 5),
    )

    assert result["num_samples"] == 6
    assert "class_4" in result["classes"]
    assert "class_5" in result["classes"]
    assert 0.0 <= result["classes"]["class_4"]["average_precision"] <= 1.0
    assert 0.0 <= result["classes"]["class_5"]["average_precision"] <= 1.0


def test_build_evaluation_report_markdown_contains_sections() -> None:
    ops = {
        "num_samples": 100,
        "near_miss_rate": 0.9,
        "fatal_5_to_0_rate": 0.01,
        "fatal_5_to_1_rate": 0.03,
        "mean_abs_error": 0.4,
    }
    pr = {
        "num_samples": 100,
        "classes": {
            "class_4": {"average_precision": 0.5, "prevalence": 0.1},
            "class_5": {"average_precision": 0.4, "prevalence": 0.05},
        },
    }

    report = build_evaluation_report_markdown("unit_test_run", ops, pr)

    assert "# Evaluation Report: unit_test_run" in report
    assert "## Operational Metrics" in report
    assert "## Rare-Class PR Metrics" in report
    assert "class_4" in report
