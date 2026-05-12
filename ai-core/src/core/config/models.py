"""Model path settings."""

from __future__ import annotations

from pydantic import BaseModel


class ModelPathSettings(BaseModel):
	forecast: str
	rl: str
	clustering: str