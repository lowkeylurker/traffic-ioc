"""Database connection helpers for PostgreSQL access."""

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from src.core.config import settings

@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Tạo SQLAlchemy engine singleton kết nối đến PostgreSQL."""
    engine = create_engine(
        settings.database.url,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=5,
        max_overflow=10,
        connect_args={
            "connect_timeout": 15,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
            "application_name": "ai-core-train",
        },
    )
    return engine
