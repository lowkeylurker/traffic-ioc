"""Notebook-facing API for RL training orchestration."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
import json

from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.rl.artifacts import get_rl_checkpoint_path, get_rl_history_path, get_rl_metrics_path
from src.rl.training.runner import RLTrainingConfig, run_rl_training


def validate_warmstart_inputs(config: RLTrainingConfig) -> None:
    artifacts_path = Path(config.artifacts_path or str(get_ml_preprocessing_path()))
    checkpoint_path = Path(config.pretrained_model_path or str(get_ml_checkpoint_path()))

    if not artifacts_path.exists():
        raise FileNotFoundError(f"Warmstart preprocessing artifacts not found: {artifacts_path}")
    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Warmstart baseline checkpoint not found: {checkpoint_path}")


def _config_with_overrides(base: RLTrainingConfig, overrides: dict | None) -> RLTrainingConfig:
    if not overrides:
        return base

    payload = asdict(base)
    for key, value in overrides.items():
        if key not in payload:
            raise KeyError(f"Unknown RLTrainingConfig field: {key}")
        payload[key] = value
    return RLTrainingConfig(**payload)


def run_rl(mode: str, config: RLTrainingConfig | None = None, config_overrides: dict | None = None) -> dict:
    mode_normalized = (mode or "").strip().lower()
    if mode_normalized not in {"pure", "warmstart"}:
        raise ValueError("mode must be 'pure' or 'warmstart'")

    effective_config = _config_with_overrides(config or RLTrainingConfig(), config_overrides)

    if mode_normalized == "warmstart":
        validate_warmstart_inputs(effective_config)

    run_rl_training(mode=mode_normalized, config=effective_config)

    run_id = effective_config.run_id or f"{mode_normalized}_seed{effective_config.seed}_h{effective_config.prediction_horizon_minutes}"
    checkpoint_path = effective_config.checkpoint_path or str(get_rl_checkpoint_path(mode=mode_normalized, run_id=run_id))
    history_path = effective_config.history_path or str(get_rl_history_path(mode=mode_normalized, run_id=run_id))
    metrics_path = effective_config.metrics_out or str(get_rl_metrics_path(mode=mode_normalized, run_id=run_id))

    metrics_payload = {}
    metrics_file = Path(metrics_path)
    if metrics_file.exists():
        with open(metrics_file, "r", encoding="utf-8") as handle:
            metrics_payload = json.load(handle)

    return {
        "mode": mode_normalized,
        "run_id": run_id,
        "checkpoint_path": checkpoint_path,
        "history_path": history_path,
        "metrics_path": metrics_path,
        "metrics": metrics_payload,
    }
