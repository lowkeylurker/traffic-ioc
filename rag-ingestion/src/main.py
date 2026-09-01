"""Main FastAPI application entrypoint for rag-ingestion microservice.

This microservice provides asynchronous ingestion pipelines for Vietnamese traffic legislation,
parsing hierarchical documents (Chương -> Điều -> Khoản -> Điểm) into enriched semantic chunks,
generating vector embeddings via Ollama bge-m3, syncing with Qdrant and PostgreSQL OLTP,
and streaming ingestion lifecycle events over Redis Pub/Sub.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes.ingest import router as ingest_router
from src.config import settings
from src.services.redis_publisher import redis_publisher

logger = logging.getLogger("uvicorn.error")


def get_health() -> dict[str, str]:
    """Return health check diagnostic payload for Kubernetes/Docker container probes.

    Returns:
        dict[str, str]: Health status, service identifier, environment, and Qdrant collection name.
    """
    return {
        "status": "ok",
        "service": "rag-ingestion",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "qdrant_collection": settings.QDRANT_COLLECTION,
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle.

    Startup:
        - Logs initialization status with configured environment and active models.

    Shutdown:
        - Gracefully closes Redis Pub/Sub async connection pools.

    Args:
        app (FastAPI): The active FastAPI application instance.

    Yields:
        AsyncGenerator[None, None]: Context manager generator yielding control to application runtime.
    """
    logger.info(f"Starting {settings.APP_NAME} ({settings.APP_ENV})")
    yield
    # Shutdown
    logger.info("Shutting down RAG ingestion service and closing background connections...")
    await redis_publisher.close()


app = FastAPI(
    title=settings.APP_NAME,
    description="Vietnam Traffic Legislation Ingestion, AST Parsing, and Vectorization API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_endpoint():
    """Health diagnostic endpoint for liveness and readiness probes.

    Returns:
        dict[str, str]: Service health status payload.
    """
    return get_health()


app.include_router(ingest_router, prefix="/api/v1")
