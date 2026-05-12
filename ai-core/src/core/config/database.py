"""Database-specific settings."""

from __future__ import annotations

from pydantic import BaseModel, SecretStr


class DatabaseSettings(BaseModel):
	user: str
	password: SecretStr
	host: str
	port: int
	name: str

	@property
	def url(self) -> str:
		return f"postgresql://{self.user}:{self.password.get_secret_value()}@{self.host}:{self.port}/{self.name}"