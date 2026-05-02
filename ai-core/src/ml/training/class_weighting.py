"""Class-weight helpers for imbalance handling."""

from __future__ import annotations

import numpy as np
import torch
from sklearn.utils.class_weight import compute_class_weight

from src.ml.feature_contract import NUM_CLASSES


def class_balanced_weights(train_dataset, num_classes: int = NUM_CLASSES, beta: float = 0.9999) -> torch.Tensor:
    # Handle torch.utils.data.Subset
    if hasattr(train_dataset, "dataset") and hasattr(train_dataset, "indices"):
        full_targets = train_dataset.dataset.get_training_targets()
        targets = full_targets[train_dataset.indices]
    else:
        targets = train_dataset.get_training_targets()
    counts = np.bincount(targets, minlength=num_classes).astype(np.float64)
    weights = np.zeros(num_classes, dtype=np.float64)
    for c in range(num_classes):
        n = counts[c]
        if n > 0:
            weights[c] = (1.0 - beta) / (1.0 - (beta ** n))
    if weights.sum() > 0:
        weights = weights / weights.sum() * num_classes
    return torch.tensor(weights.astype(np.float32), dtype=torch.float32)


def get_class_weights(train_dataset, num_classes: int = NUM_CLASSES, clip_min: float = 0.5, clip_max: float = 25.0):
    print("⏳ Đang phân tích phân phối nhãn để tính toán Class Weights...")
    
    # Handle torch.utils.data.Subset
    if hasattr(train_dataset, "dataset") and hasattr(train_dataset, "indices"):
        full_targets = train_dataset.dataset.get_training_targets()
        y_train = full_targets[train_dataset.indices]
    else:
        y_train = train_dataset.get_training_targets()
    present_classes = np.unique(y_train)

    weights_present = compute_class_weight(
        class_weight="balanced",
        classes=present_classes,
        y=y_train,
    )

    final_weights = np.ones(num_classes, dtype=np.float32)
    for idx, cls in enumerate(present_classes):
        if cls < num_classes:
            final_weights[cls] = weights_present[idx]

    final_weights = np.clip(final_weights, clip_min, clip_max)

    print(f"📊 Phân bổ Trọng số Phạt ({num_classes} lớp): {np.round(final_weights, 3)}")
    return torch.tensor(final_weights, dtype=torch.float32)
