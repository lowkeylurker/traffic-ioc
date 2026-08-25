"""Main FastAPI application entrypoint for rag-ingestion microservice."""

from src.config import settings

def get_health():
    return {
        "status": "ok",
        "service": "rag-ingestion",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "qdrant_collection": settings.QDRANT_COLLECTION,
    }

try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from src.api.routes.ingest import router as ingest_router

    app = FastAPI(
        title=settings.APP_NAME,
        description="Vietnam Traffic Legislation Ingestion and Vectorization API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
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
        return get_health()

    if ingest_router:
        app.include_router(ingest_router, prefix="/api/v1")

except ImportError:
    app = None  # type: ignore


if __name__ == "__main__":
    try:
        import uvicorn
        uvicorn.run("src.main:app", host=settings.HOST, port=settings.PORT, reload=True)
    except ImportError:
        print(f"Starting {settings.APP_NAME} on {settings.HOST}:{settings.PORT}")
