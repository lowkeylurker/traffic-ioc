"""API service settings."""

from __future__ import annotations

from pydantic import BaseModel


class ApiSettings(BaseModel):
	host: str
	port: int
	log_level: str