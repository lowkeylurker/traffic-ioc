"""Core layer – Nền tảng cho data-pipeline module.

Re-exports:
    settings       – Application configuration
    get_engine     – SQLAlchemy Engine singleton
    get_session    – Session context manager
    metadata       – Shared MetaData
    get_logger     – Structured logger factory
    PipelineError, DataExtractionError, DataValidationError, DatabaseLoadError
"""

from src.core.config import settings
from src.core.database import get_engine, get_session, metadata
from src.core.exceptions import (
    DatabaseLoadError,
    DataExtractionError,
    DataValidationError,
    PipelineError,
)
from src.core.logger import get_logger

__all__ = [
    "settings",
    "get_engine",
    "get_session",
    "metadata",
    "get_logger",
    "PipelineError",
    "DataExtractionError",
    "DataValidationError",
    "DatabaseLoadError",
]
