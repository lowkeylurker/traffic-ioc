"""Database connection and SQLAlchemy async engine lifecycle management for OLTP storage.

Provides centralized database engine initialization, connection string normalization,
Prisma-specific query parameter sanitization, and async session factories.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, Optional

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from src.core.config import settings

logger = logging.getLogger(__name__)

# Global singleton async engine and sessionmaker cache
_async_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def normalize_async_db_url(url_str: str) -> tuple[str, dict[str, Any]]:
    """Normalize asyncpg driver prefix and sanitize Prisma-specific query parameters.

    Converts standard `postgresql://` or `postgres://` connection URIs to
    `postgresql+asyncpg://`, and extracts Prisma-specific parameters like `schema`
    so they are forwarded safely via `server_settings` instead of breaking asyncpg.

    Args:
        url_str (str): Raw PostgreSQL connection URI.

    Returns:
        tuple[str, dict[str, Any]]: A tuple containing the sanitized asyncpg URL string
            and a dictionary of connect_args (e.g. server_settings search_path).
    """
    parsed_url = make_url(url_str)

    # Normalize driver prefix to postgresql+asyncpg
    drivername = parsed_url.drivername
    if drivername in ("postgresql", "postgres"):
        drivername = "postgresql+asyncpg"
    elif "+asyncpg" not in drivername and "postgresql" in drivername:
        drivername = f"{drivername}+asyncpg"

    # Sanitize query parameters that asyncpg.connect() does not directly accept
    query_dict = dict(parsed_url.query)
    schema_param = query_dict.pop("schema", None)

    connect_args: dict[str, Any] = {}
    if schema_param and schema_param != "public":
        connect_args["server_settings"] = {"search_path": schema_param}

    clean_url = parsed_url.set(drivername=drivername, query=query_dict)
    return clean_url.render_as_string(hide_password=False), connect_args


def get_async_engine(db_url: Optional[str] = None) -> AsyncEngine:
    """Retrieve or initialize the cached singleton SQLAlchemy AsyncEngine.

    Args:
        db_url (Optional[str]): Database connection string. If omitted, defaults to settings.DATABASE_URL.

    Returns:
        AsyncEngine: The configured SQLAlchemy AsyncEngine instance.
    """
    global _async_engine
    target_url = db_url or settings.DATABASE_URL

    if _async_engine is None or (db_url and db_url != settings.DATABASE_URL):
        clean_url, connect_args = normalize_async_db_url(target_url)
        logger.info(f"Initializing SQLAlchemy AsyncEngine for {clean_url.split('@')[-1]}...")
        engine = create_async_engine(
            clean_url,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
        if db_url is None:
            _async_engine = engine
        return engine

    return _async_engine


def get_async_session_factory(db_url: Optional[str] = None) -> async_sessionmaker[AsyncSession]:
    """Retrieve or initialize the cached SQLAlchemy async_sessionmaker factory.

    Args:
        db_url (Optional[str]): Database connection string. If omitted, defaults to settings.DATABASE_URL.

    Returns:
        async_sessionmaker[AsyncSession]: Async session maker factory.
    """
    global _session_factory
    engine = get_async_engine(db_url)

    if _session_factory is None or (db_url and db_url != settings.DATABASE_URL):
        factory = async_sessionmaker(engine, expire_on_commit=False)
        if db_url is None:
            _session_factory = factory
        return factory

    return _session_factory


@asynccontextmanager
async def get_db_session(
    db_url: Optional[str] = None,
) -> AsyncGenerator[AsyncSession, None]:
    """Context manager yielding an active SQLAlchemy AsyncSession with automatic transaction rollback on failure.

    Args:
        db_url (Optional[str]): Database connection string. If omitted, defaults to settings.DATABASE_URL.

    Yields:
        AsyncSession: Active asynchronous database session.

    Raises:
        Exception: Re-raises any exception that occurs during the session lifecycle.
    """
    session_maker = get_async_session_factory(db_url)
    async with session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def close_db_engine() -> None:
    """Gracefully dispose the global AsyncEngine connection pool."""
    global _async_engine, _session_factory
    if _async_engine is not None:
        logger.info("Disposing global SQLAlchemy AsyncEngine connection pool...")
        await _async_engine.dispose()
        _async_engine = None
        _session_factory = None
