"""Quản lý cấu hình – Load biến môi trường từ data-pipeline/.env.

Export:
    settings: Settings singleton instance.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


# Tìm .env: data-pipeline/.env (2 cấp lên từ core/)
_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment / .env file."""

    # ── Database ──────────────────────────────────────────
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "traffic_ioc"
    db_user: str = "traffic_user"
    db_password: str = "traffic_password"
    db_sslmode: str = "disable"

    # ── API Keys ──────────────────────────────────────────
    tomtom_api_key: str = ""
    openweather_api_key: str = ""
    serpapi_key: str = ""

    # ── Logging ───────────────────────────────────────────
    log_level: str = "INFO"
    log_dir: Optional[str] = None

    @property
    def database_url(self) -> str:
        """Tự ghép connection string PostgreSQL."""
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
            f"?sslmode={self.db_sslmode}"
        )

    class Config:
        env_file = str(_ENV_PATH)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
