"""Shared API dependencies for FastAPI routes."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException

from src.ml.artifacts import get_ml_preprocessing_path
from src.rl.artifacts import get_rl_checkpoint_path
from src.rl.inference.predictor import RLTrafficPredictor


def _resolve_horizon_paths(prediction_horizon_minutes: int) -> tuple[str, str]:
	if prediction_horizon_minutes not in (15, 30):
		raise ValueError("prediction_horizon_minutes must be 15 or 30")

	ml_run_id = f"manual_h{prediction_horizon_minutes}"
	artifacts_path = get_ml_preprocessing_path(run_id=ml_run_id)

	# Preferred RL run-id aligned with horizon; keep backward-compatible fallback.
	rl_run_candidates = [
		f"notebook_warmstart_h{prediction_horizon_minutes}",
		f"manual_h{prediction_horizon_minutes}",
		f"warmstart_manual_h{prediction_horizon_minutes}",
		None,
	]

	resolved_model_path: Path | None = None
	for run_id in rl_run_candidates:
		candidate = get_rl_checkpoint_path(mode="warmstart", run_id=run_id)
		if candidate.exists():
			resolved_model_path = candidate
			break

	if resolved_model_path is None:
		raise FileNotFoundError(
			"No warmstart checkpoint found for horizon "
			f"{prediction_horizon_minutes} (tried run_id=manual_h{prediction_horizon_minutes}, "
			f"warmstart_manual_h{prediction_horizon_minutes}, and default)."
		)

	if not artifacts_path.exists():
		raise FileNotFoundError(
			f"Missing preprocessing artifact for run_id={ml_run_id}: {artifacts_path}"
		)

	return str(resolved_model_path), str(artifacts_path)


@lru_cache(maxsize=2)
def _build_warmstart_predictor(prediction_horizon_minutes: int) -> RLTrafficPredictor:
	model_path, artifacts_path = _resolve_horizon_paths(prediction_horizon_minutes)
	return RLTrafficPredictor(model_path=model_path, artifacts_path=artifacts_path)


def get_warmstart_rl_predictor() -> RLTrafficPredictor:
	return get_warmstart_rl_predictor_by_horizon(15)


def get_warmstart_rl_predictor_by_horizon(prediction_horizon_minutes: int) -> RLTrafficPredictor:
	try:
		return _build_warmstart_predictor(prediction_horizon_minutes)
	except Exception as exc:
		raise HTTPException(
			status_code=503,
			detail=(
				f"Warmstart RL model is unavailable for horizon={prediction_horizon_minutes}: {exc}"
			),
		) from exc
