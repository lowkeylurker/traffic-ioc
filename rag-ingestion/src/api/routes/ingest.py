"""FastAPI ingestion route controllers for document intake and background job scheduling.

All ingestion endpoints operate strictly in asynchronous mode:
1. Accept and validate the request DTO.
2. Schedule the background orchestration job via FastAPI `BackgroundTasks`.
3. Immediately return HTTP 202 Accepted with a unique `jobId`.
4. The background job emits real-time milestone events across the Redis Pub/Sub bus.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, status

from src.schemas.ingest import (
    IngestionRequest,
    JobAcceptedResponse,
    RetryProcessRequest,
)
from src.services.ingestion_pipeline import ingestion_pipeline

router = APIRouter(prefix="/ingest/traffic-law", tags=["Ingestion"])


@router.post(
    "/process-async",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Enqueue document ingestion job",
    description=(
        "Accepts document metadata and MinIO storage references or raw text, schedules "
        "background parsing, enrichment, embedding, and vector synchronization, and "
        "returns an immediate 202 Accepted status with a tracking jobId."
    ),
)
async def process_traffic_law_async_endpoint(
    request: IngestionRequest,
    background_tasks: BackgroundTasks,
    job_id: Optional[str] = None,
) -> JobAcceptedResponse:
    """Handle asynchronous document ingestion dispatch.

    Args:
        request (IngestionRequest): Ingestion payload with doc_id, storage_key, or content_text.
        background_tasks (BackgroundTasks): FastAPI background task manager.
        job_id (Optional[str]): Optional client-provided job identifier token.

    Returns:
        JobAcceptedResponse: Confirmation with jobId for Redis Pub/Sub progress tracking.
    """
    effective_job_id = job_id or f"job-{uuid.uuid4()}"
    background_tasks.add_task(ingestion_pipeline.process_ingestion_async, request, effective_job_id)
    return JobAcceptedResponse(
        status="accepted",
        jobId=effective_job_id,
        docCode=request.doc_code,
        message="Ingestion job queued for asynchronous processing",
    )


@router.post(
    "/retry",
    response_model=JobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry or re-index existing document",
    description=(
        "Re-triggers the AST extraction, vector calculation, and database synchronization "
        "pipeline for an existing document identified by doc_id or doc_code."
    ),
)
async def retry_traffic_law_process(
    request: RetryProcessRequest,
    background_tasks: BackgroundTasks,
) -> JobAcceptedResponse:
    """Handle document re-indexing and retry dispatch.

    Args:
        request (RetryProcessRequest): Payload containing doc_id or doc_code to re-index.
        background_tasks (BackgroundTasks): FastAPI background task manager.

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
    background_tasks.add_task(ingestion_pipeline.process_ingestion_async, req, effective_job_id)
    return JobAcceptedResponse(
        status="accepted",
        jobId=effective_job_id,
        docCode=request.doc_code,
        message=f"Retry processing initiated for document {request.doc_code}",
    )
