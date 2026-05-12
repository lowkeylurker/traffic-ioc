"""Reinforcement learning settings."""

from __future__ import annotations

from pydantic import BaseModel


class RLSettings(BaseModel):
	algorithm: str
	threshold: float
	time_window_minutes: int