"""Celery distributed task queue application initialization and configuration.

Provides a robust background worker architecture for document ingestion,
decoupling long-running OCR, AST parsing, and vectorization pipelines from FastAPI HTTP threads.
"""

from celery import Celery

from src.core.config import settings

celery_app = Celery(
    "rag_ingestion",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_track_started=True,
    task_default_queue=settings.CELERY_TASK_DEFAULT_QUEUE,
    task_routes={
        "rag.process_document_ingestion": {"queue": settings.CELERY_TASK_DEFAULT_QUEUE},
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# Autodiscover background task modules
celery_app.autodiscover_tasks(["src.tasks"])
