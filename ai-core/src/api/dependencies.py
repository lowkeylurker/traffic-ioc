"""Shared API dependencies for FastAPI routes."""

from __future__ import annotations

from functools import lru_cache

from fastapi import HTTPException

from src.ml.artifacts import get_ml_preprocessing_path
from src.rl.artifacts import get_rl_checkpoint_path
from src.rl.inference.predictor import RLTrafficPredictor


@lru_cache(maxsize=1)
def _build_warmstart_predictor() -> RLTrafficPredictor:
	model_path = str(get_rl_checkpoint_path(mode="warmstart", run_id=None))
	artifacts_path = str(get_ml_preprocessing_path(run_id=None))
	return RLTrafficPredictor(model_path=model_path, artifacts_path=artifacts_path)


def get_warmstart_rl_predictor() -> RLTrafficPredictor:
	try:
		return _build_warmstart_predictor()
	except Exception as exc:
		raise HTTPException(status_code=503, detail=f"Warmstart RL model is unavailable: {exc}") from exc
