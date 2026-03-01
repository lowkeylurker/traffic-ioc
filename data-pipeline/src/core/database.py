"""Kết nối PostgreSQL – SQLAlchemy 2.0 Engine (singleton) + Session factory.

Export:
    get_engine()  → Engine singleton
    get_session() → context manager yielding Session
    health_check() → bool
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import Engine, MetaData, create_engine, text
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.logger import get_logger

_logger = get_logger("database")

# ── Singleton Engine ──────────────────────────────────────
_engine: Engine | None = None

# ── Shared MetaData (để reflect tables) ───────────────────
metadata = MetaData()


def get_engine() -> Engine:
    """Trả về SQLAlchemy Engine singleton.

    Pool settings:
        pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=1800
    """
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=1800,
        )
        _logger.info("SQLAlchemy Engine created")
    return _engine


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """Context manager: auto-commit khi OK, auto-rollback khi exception."""
    engine = get_engine()
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise


def health_check() -> bool:
    """Kiểm tra kết nối PostgreSQL."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _logger.info("Database health check: OK")
        return True
    except Exception as exc:
        _logger.error(f"Database health check FAILED: {exc}")
        return False
