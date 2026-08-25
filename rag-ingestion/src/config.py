"""Application configuration for rag-ingestion microservice."""

import os
from typing import Optional

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:
    try:
        from pydantic import BaseSettings  # type: ignore
        SettingsConfigDict = None  # type: ignore
    except ImportError:
        # Fallback implementation when pydantic is not installed
        class BaseSettings:  # type: ignore
            def __init__(self, **kwargs):
                for k, v in self._get_defaults().items():
                    env_val = os.getenv(k.upper(), os.getenv(k))
                    setattr(self, k, env_val if env_val is not None else kwargs.get(k, v))
                for k, v in kwargs.items():
                    setattr(self, k, v)

            @classmethod
            def _get_defaults(cls):
                return {
                    k: getattr(cls, k)
                    for k in dir(cls)
                    if not k.startswith("_") and not callable(getattr(cls, k))
                }
        SettingsConfigDict = None  # type: ignore


class Settings(BaseSettings):
    APP_NAME: str = "Vietnam Traffic Legislation Ingestion Service"
    APP_ENV: str = "development"
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # PostgreSQL OLTP Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/traffic_ioc_oltp"
    
    # Qdrant Vector Store
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "vietnam_traffic_laws"
    QDRANT_VECTOR_SIZE: int = 1024
    
    # Ollama Embeddings
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "bge-m3"
    
    # Google Gemini Vision OCR
    GEMINI_API_KEY: str = ""
    GEMINI_OCR_MODEL: str = "gemini-1.5-flash"

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore",
            case_sensitive=True,
        )


settings = Settings()
