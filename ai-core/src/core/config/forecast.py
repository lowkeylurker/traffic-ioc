"""Forecast settings."""

from __future__ import annotations

from pydantic import BaseModel


class ForecastSettings(BaseModel):
	horizon_steps: int
	history_window: int
	use_ensemble: bool