"""Application configuration for rag-ingestion microservice."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Vietnam Traffic Legislation Ingestion Service"
    APP_ENV: str = "development"
    PORT: int = 8001
    HOST: str = "0.0.0.0"

    # PostgreSQL OLTP Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/traffic_ioc_oltp"

    # MinIO / S3 Object Storage
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "traffic-ioc-documents"
    MINIO_SECURE: bool = False

    # Qdrant Vector Store
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "vietnam_traffic_laws"
    QDRANT_VECTOR_SIZE: int = 1024

    # Ollama Embeddings
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_EMBED_MODEL: str = "bge-m3"

    # Redis Pub/Sub & Caching
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_INGESTION_CHANNEL: str = "rag:ingestion:events"

    # Google Gemini Vision OCR
    GEMINI_API_KEY: str = ""
    GEMINI_OCR_MODEL: str = "gemini-1.5-flash"

    model_config = SettingsConfigDict(
        env_file=(
            str(BASE_DIR / ".env"),
            ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()
