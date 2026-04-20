"""Centralized artifact paths for ML training and inference."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

ArtifactKind = Literal["checkpoints", "metrics", "preprocessing", "predictions", "logs"]


def get_ml_artifact_root() -> Path:
    env_root = os.getenv("ML_ARTIFACT_ROOT")
    if env_root:
        return Path(env_root)

    container_root = Path("/app")
    if container_root.exists():
        return container_root / "artifacts" / "ml"

    return Path("artifacts") / "ml"


def ensure_ml_artifact_dirs() -> None:
    root = get_ml_artifact_root()
    for kind in ("checkpoints", "metrics", "preprocessing", "predictions", "logs"):
        (root / kind).mkdir(parents=True, exist_ok=True)


def get_ml_artifact_dir(kind: ArtifactKind) -> Path:
    ensure_ml_artifact_dirs()
    return get_ml_artifact_root() / kind


def get_ml_checkpoint_path(run_id: str | None = None) -> Path:
    ensure_ml_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_ml_artifact_root() / "checkpoints" / f"best_traffic_model{suffix}.pt"


def get_ml_preprocessing_path(run_id: str | None = None) -> Path:
    ensure_ml_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_ml_artifact_root() / "preprocessing" / f"preprocessing_artifacts{suffix}.pkl"


def get_ml_metrics_path(run_id: str | None = None) -> Path:
    ensure_ml_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_ml_artifact_root() / "metrics" / f"ml_metrics{suffix}.json"
