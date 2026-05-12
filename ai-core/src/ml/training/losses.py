"""Loss functions used during model training."""

from __future__ import annotations

import torch
import torch.nn as nn


def focal_loss(logits, targets, alpha=None, gamma: float = 2.0):
    ce = nn.functional.cross_entropy(logits, targets, weight=alpha, reduction="none")
    pt = torch.exp(-ce)
    loss = ((1 - pt) ** gamma) * ce
    return loss.mean()
