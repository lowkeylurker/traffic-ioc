"""Evaluation helpers for RL policies on holdout datasets."""

from __future__ import annotations

import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support


def evaluate_policy_net(policy_net, dataloader, device: str = "cpu") -> dict:
    """Evaluate a trained policy network against ground-truth labels from dataloader."""
    policy_net.eval()

    all_preds: list[int] = []
    all_targets: list[int] = []

    with torch.no_grad():
        for batch in dataloader:
            x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]
            logits = policy_net(x_dynamic, x_static, x_cat)
            preds = torch.argmax(logits, dim=1)

            all_preds.extend(preds.cpu().numpy().astype(int).tolist())
            all_targets.extend(y_target.cpu().numpy().astype(int).tolist())

    if not all_targets:
        return {
            "num_samples": 0,
            "accuracy": 0.0,
            "macro_f1": 0.0,
            "minority_recall_35": 0.0,
            "per_class_metrics": {},
            "confusion_matrix": [],
        }

    precision, recall, f1, support = precision_recall_fscore_support(
        all_targets,
        all_preds,
        labels=[0, 1, 2, 3, 4, 5],
        average=None,
        zero_division=0,
    )

    per_class = {}
    for cls_idx in range(6):
        per_class[f"class_{cls_idx}"] = {
            "precision": float(precision[cls_idx]),
            "recall": float(recall[cls_idx]),
            "f1": float(f1[cls_idx]),
            "support": int(support[cls_idx]),
        }

    cm = confusion_matrix(all_targets, all_preds, labels=[0, 1, 2, 3, 4, 5])

    return {
        "num_samples": int(len(all_targets)),
        "accuracy": float(accuracy_score(all_targets, all_preds)),
        "macro_f1": float(f1_score(all_targets, all_preds, average="macro", zero_division=0)),
        "minority_recall_35": float((recall[3] + recall[4] + recall[5]) / 3.0),
        "per_class_metrics": per_class,
        "confusion_matrix": cm.tolist(),
    }
