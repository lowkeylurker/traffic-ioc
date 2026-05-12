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
    tomtom_api_key: str = ""             # single-key fallback
    tomtom_api_keys: str = ""            # comma-separated pool (takes priority)
    tomtom_daily_limit_per_key: int = 2500  # default TomTom free tier
    gold_corridor_names: str = ""        # comma-separated corridor whitelist for quality dataset
    openweather_api_key: str = ""
    serpapi_key: str = ""

    # ── PCU Estimation (BPR inverse tuning) ───────────────
    # Safer runtime defaults to reduce early saturation at lane capacity.
    pcu_bpr_alpha: float = 0.35
    pcu_bpr_beta: float = 4.0
    pcu_max_vc_ratio: float = 1.0

    # ── Logging ───────────────────────────────────────────
    log_level: str = "INFO"
    log_dir: Optional[str] = None

    def get_tomtom_keys(self) -> list[str]:
        """Return list of TomTom API keys.

        Priority:
          1. TOMTOM_API_KEYS (comma-separated, for multi-key pool mode)
          2. TOMTOM_API_KEY  (single-key legacy mode)
        """
        if self.tomtom_api_keys:
            keys = [k.strip() for k in self.tomtom_api_keys.split(",") if k.strip()]
            if keys:
                return keys
        if self.tomtom_api_key:
            return [self.tomtom_api_key]
        return []

    def get_gold_corridor_names(self) -> list[str]:
        """Return configured gold corridor whitelist by corridor_name."""
        if not self.gold_corridor_names:
            return []
        return [name.strip() for name in self.gold_corridor_names.split(",") if name.strip()]

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
