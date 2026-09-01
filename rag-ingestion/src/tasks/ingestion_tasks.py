"""Celery task worker definitions for asynchronous legal document ingestion.

Executes the full parsing, OCR, AST construction, vector embedding, and database sync
pipeline in isolated Celery worker processes with persistent Redis task queuing.
"""

import asyncio
import logging
from typing import Any, Dict

from celery import Task

from src.core.celery_app import celery_app
from src.schemas.ingest import IngestionRequest
from src.services.ingestion_pipeline import ingestion_pipeline

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="rag.process_document_ingestion",
    max_retries=3,
    default_retry_delay=15,
)
def process_document_ingestion_task(
    self: Task,
    req_dict: Dict[str, Any],
    job_id: str,
) -> Dict[str, Any]:
    """Execute document ingestion pipeline asynchronously within a Celery worker.

    Args:
        self (Task): Bound Celery task context instance.
        req_dict (Dict[str, Any]): Serialized IngestionRequest dictionary.
        job_id (str): Unique job tracking token for Redis Pub/Sub milestones.

    Returns:
        Dict[str, Any]: Summary dictionary confirming task execution outcome.

    Raises:
        Exception: Re-raises and schedules automatic task retry if transient failures occur.
    """
    logger.info(
        f"👷 [Celery Worker Task: {self.request.id}] Processing ingestion job '{job_id}'..."
    )
    try:
        req = IngestionRequest.model_validate(req_dict)
        asyncio.run(ingestion_pipeline.process_ingestion_async(req, job_id))
        logger.info(
            f"✅ [Celery Worker Task: {self.request.id}] Successfully completed ingestion for job '{job_id}'."
        )
        return {
            "status": "completed",
            "job_id": job_id,
            "doc_code": req.doc_code,
            "task_id": self.request.id,
        }
    except Exception as exc:
        logger.error(
            f"❌ [Celery Worker Task: {self.request.id}] Ingestion failed for job '{job_id}': {exc}",
            exc_info=True,
        )
        # Automatically retry transient failures up to max_retries
        if self.request.retries < self.max_retries:
            logger.warning(
                f"🔄 [Celery Worker Task: {self.request.id}] Retrying job '{job_id}' (attempt {self.request.retries + 1}/{self.max_retries})..."
            )
            raise self.retry(exc=exc)
        raise exc
