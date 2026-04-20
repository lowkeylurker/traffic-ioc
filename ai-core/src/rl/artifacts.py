"""Centralized artifact paths for RL training, benchmarking, and inference."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

ArtifactKind = Literal["checkpoints", "metrics", "histories", "preprocessing", "benchmark", "predictions", "logs"]


def get_rl_artifact_root() -> Path:
    """Return the root directory used to store RL artifacts.

    The root can be overridden with RL_ARTIFACT_ROOT, but defaults to
    /app/artifacts/rl inside the container and artifacts/rl in the repo.
    """
    env_root = os.getenv("RL_ARTIFACT_ROOT")
    if env_root:
        return Path(env_root)

    container_root = Path("/app")
    if container_root.exists():
        return container_root / "artifacts" / "rl"

    return Path("artifacts") / "rl"


def ensure_rl_artifact_dirs() -> None:
    root = get_rl_artifact_root()
    for kind in ("checkpoints", "metrics", "histories", "preprocessing", "benchmark", "predictions", "logs"):
        (root / kind).mkdir(parents=True, exist_ok=True)


def get_rl_artifact_dir(kind: ArtifactKind) -> Path:
    ensure_rl_artifact_dirs()
    return get_rl_artifact_root() / kind


def get_rl_checkpoint_path(mode: str, run_id: str | None = None) -> Path:
    ensure_rl_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_rl_artifact_root() / "checkpoints" / f"best_rl_agent_{mode}{suffix}.pt"


def get_rl_history_path(mode: str, run_id: str | None = None) -> Path:
    ensure_rl_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_rl_artifact_root() / "histories" / f"rl_history_{mode}{suffix}.pkl"


def get_rl_metrics_path(mode: str, run_id: str | None = None) -> Path:
    ensure_rl_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_rl_artifact_root() / "metrics" / f"rl_metrics_{mode}{suffix}.json"


def get_rl_benchmark_summary_path(name: str = "rl_benchmark_pilot_summary.json") -> Path:
    ensure_rl_artifact_dirs()
    return get_rl_artifact_root() / "benchmark" / name


def get_rl_comparison_path(name: str = "rl_benchmark_comparison.json") -> Path:
    ensure_rl_artifact_dirs()
    return get_rl_artifact_root() / "benchmark" / name


def get_rl_preprocessing_artifacts_path(mode: str = "pure", run_id: str | None = None) -> Path:
    ensure_rl_artifact_dirs()
    suffix = f"_{run_id}" if run_id else ""
    return get_rl_artifact_root() / "preprocessing" / f"rl_{mode}_preprocessing_artifacts{suffix}.pkl"


def get_rl_prediction_output_dir() -> Path:
    ensure_rl_artifact_dirs()
    return get_rl_artifact_root() / "predictions"
