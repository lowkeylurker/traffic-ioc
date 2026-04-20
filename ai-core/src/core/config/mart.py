"""Forecast mart settings."""

from __future__ import annotations

from pydantic import BaseModel


class MartSettings(BaseModel):
	use_forecast_mart: bool
	self_refresh: bool
	stale_minutes: int
	refresh_cooldown_sec: int
	refresh_lookback_days: int