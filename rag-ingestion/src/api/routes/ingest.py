"""FastAPI ingestion route controllers for document intake and Celery task dispatching.

All ingestion endpoints operate strictly in asynchronous mode:
1. Accept and validate the request DTO.
2. Enqueue the distributed background task via Celery over Redis broker.
3. Immediately return HTTP 202 Accepted with a unique `jobId`.
4. The Celery background worker executes the pipeline and emits milestone events across Redis Pub/Sub.
"""

import uuid
from typing import Any, Dict, Optional

from celery.result import AsyncResult
from fastapi import APIRouter, status

from src.core.celery_app import celery_app
from src.schemas.ingest import (
    IngestionRequest,
    JobAcceptedResponse,
    RetryProcessRequest,
)
from src.tasks.ingestion_tasks import process_document_ingestion_task

router = APIRouter(prefix="/ingest/traffic-law", tags=["Ingestion"])


@router.post(
    "/process-async",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue document ingestion job to Celery worker",
    description=(
        "Accepts document metadata and MinIO storage references or raw text, enqueues "
        "background parsing, enrichment, embedding, and vector synchronization to Celery workers, "
        "and returns an immediate 202 Accepted status with a tracking jobId."
    ),
)
async def process_traffic_law_async_endpoint(
    request: IngestionRequest,
    job_id: Optional[str] = None,
) -> JobAcceptedResponse:
    """Handle asynchronous document ingestion dispatch via Celery.

    Args:
        request (IngestionRequest): Ingestion payload with doc_id, storage_key, or content_text.
        job_id (Optional[str]): Optional client-provided job identifier token.

    Returns:
        JobAcceptedResponse: Confirmation with jobId for Redis Pub/Sub progress tracking.
    """
    effective_job_id = job_id or f"job-{uuid.uuid4()}"
    process_document_ingestion_task.apply_async(
        kwargs={
            "req_dict": request.model_dump(),
            "job_id": effective_job_id,
        },
        task_id=effective_job_id,
    )
    return JobAcceptedResponse(
        status="accepted",
        jobId=effective_job_id,
        docCode=request.doc_code,
        message="Ingestion job enqueued to Celery distributed worker queue",
    )


@router.post(
    "/retry",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry or re-index existing document via Celery",
    description=(
        "Re-triggers the AST extraction, vector calculation, and database synchronization "
        "pipeline for an existing document identified by doc_id or doc_code via Celery worker."
    ),
)
async def retry_traffic_law_process(
    request: RetryProcessRequest,
) -> JobAcceptedResponse:
    """Handle document re-indexing and retry dispatch via Celery.

    Args:
        request (RetryProcessRequest): Payload containing doc_id or doc_code to re-index.

    Returns:
        JobAcceptedResponse: Confirmation with jobId for tracking the re-indexing lifecycle.
    """
    effective_job_id = request.job_id or f"job-{uuid.uuid4()}"
    req = IngestionRequest(
        doc_id=request.doc_id,
        kb_code=request.kb_code,
        kb_name=request.kb_name,
        doc_code=request.doc_code,
        doc_title=request.doc_title or request.doc_code,
        storage_key=request.storage_key,
        content_text=request.content_text,
        is_scanned=request.is_scanned,
    )
    process_document_ingestion_task.apply_async(
        kwargs={
            "req_dict": req.model_dump(),
            "job_id": effective_job_id,
        },
        task_id=effective_job_id,
    )
    return JobAcceptedResponse(
        status="accepted",
        jobId=effective_job_id,
        docCode=request.doc_code,
        message=f"Retry processing enqueued for document {request.doc_code}",
    )


@router.get(
    "/jobs/{job_id}/status",
    response_model=Dict[str, Any],
    summary="Query Celery ingestion task execution status",
    description="Inspects Celery backend state for a specific job token.",
)
async def get_job_status(job_id: str) -> Dict[str, Any]:
    """Inspect Celery task execution status.

    Args:
        job_id (str): Unique job identifier token.

    Returns:
        Dict[str, Any]: Task status, ready flag, and result/error details.
    """
    async_result = AsyncResult(job_id, app=celery_app)
    return {
        "job_id": job_id,
        "state": async_result.state,
        "ready": async_result.ready(),
        "successful": async_result.successful() if async_result.ready() else None,
        "result": str(async_result.result) if async_result.ready() else None,
    }
