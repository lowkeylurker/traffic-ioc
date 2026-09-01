"""Pydantic DTO data validation models for RAG ingestion microservice."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class IngestionRequest(BaseModel):
    """Payload schema for triggering an asynchronous document ingestion job.

    Attributes:
        doc_id (Optional[str]): Primary key UUID of document in PostgreSQL OLTP (used to resolve storage_key).
        kb_code (str): Unique code of the target KnowledgeBase (default: "vietnam_traffic_legislation").
        kb_name (str): Human-readable name of the KnowledgeBase.
        doc_code (str): Official decree/law code (e.g., "100/2019/ND-CP").
        doc_title (str): Full title of the legislation decree or circular.
        source_url (Optional[str]): External government portal URL or S3 URI.
        storage_key (Optional[str]): MinIO object storage key (e.g., "laws/ND-100-2019/nd100.pdf").
        filename (str): Name of the source file including extension (default: "document.md").
        content_text (Optional[str]): Raw plain text or Markdown content for direct text ingestion.
        is_scanned (Optional[bool]): Manual override flag forcing OCR vision transcription.
        metadata (Optional[Dict[str, Any]]): Additional metadata attributes attached to document chunks.
    """

    doc_id: Optional[str] = Field(
        default=None,
        description="UUID of document record in PostgreSQL OLTP for resolving MinIO object key.",
    )
    kb_code: str = Field(
        default="vietnam_traffic_legislation",
        description="Knowledge base unique identifier code.",
    )
    kb_name: str = Field(
        default="Cơ sở dữ liệu Pháp luật Giao thông Việt Nam",
        description="Display name of the knowledge base catalog.",
    )
    doc_code: str = Field(
        default="",
        description="Official document reference code (e.g. 100/2019/ND-CP).",
    )
    doc_title: str = Field(
        default="",
        description="Full title of the traffic decree or regulation.",
    )
    source_url: Optional[str] = Field(
        default=None,
        description="Source reference URL or MinIO S3 URI.",
    )
    storage_key: Optional[str] = Field(
        default=None,
        description="MinIO object storage path where raw binary is persisted.",
    )
    filename: str = Field(
        default="document.md",
        description="File name with extension (.pdf, .docx, .md).",
    )
    content_text: Optional[str] = Field(
        default=None,
        description="Raw plain text or markdown legal content for direct scrapers.",
    )
    is_scanned: Optional[bool] = Field(
        default=None,
        description="Explicit flag to force Gemini Vision OCR transcription.",
    )
    job_id: Optional[str] = Field(
        default=None,
        description="Optional tracking job ID token passed from caller for event correlation.",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional dictionary of custom metadata fields.",
    )


class JobAcceptedResponse(BaseModel):
    """Standard HTTP 202 Accepted response for queued asynchronous background jobs.

    Attributes:
        status (str): Current acceptance state ("accepted").
        jobId (str): Unique job identifier for tracking progress via Redis Pub/Sub / SSE stream.
        docCode (str): Identifier code of the document being processed.
        message (str): Human-readable confirmation message.
    """

    status: str = Field(default="accepted", description="Acceptance status string.")
    jobId: str = Field(description="Unique background job UUID / ID for progress subscription.")
    docCode: str = Field(description="Document code associated with this ingestion task.")
    message: str = Field(description="Descriptive message confirming task enqueueing.")


class RetryProcessRequest(BaseModel):
    """Payload schema for re-triggering indexing on an existing legal document.

    Attributes:
        doc_id (Optional[str]): Primary key UUID in OLTP database.
        kb_code (str): Knowledge base identifier code.
        kb_name (str): Knowledge base display name.
        doc_code (str): Official document code.
        doc_title (Optional[str]): Document title override.
        storage_key (Optional[str]): MinIO object storage key for document binary.
        content_text (Optional[str]): Raw text content if re-submitting updated text.
        is_scanned (Optional[bool]): Flag to force OCR vision transcription on re-index.
        job_id (Optional[str]): Optional custom job ID for client tracking correlation.
    """

    doc_id: Optional[str] = Field(
        default=None,
        description="UUID of document record in PostgreSQL OLTP.",
    )
    kb_code: str = Field(
        default="vietnam_traffic_legislation",
        description="Knowledge base unique identifier code.",
    )
    kb_name: str = Field(
        default="Cơ sở dữ liệu Pháp luật Giao thông Việt Nam",
        description="Knowledge base display name.",
    )
    doc_code: str = Field(
        description="Official document reference code to re-index.",
    )
    doc_title: Optional[str] = Field(
        default=None,
        description="Title of the decree (defaults to doc_code if omitted).",
    )
    storage_key: Optional[str] = Field(
        default=None,
        description="MinIO object storage path for retrieving original binary.",
    )
    content_text: Optional[str] = Field(
        default=None,
        description="Updated text content if re-indexing from modified text.",
    )
    is_scanned: Optional[bool] = Field(
        default=None,
        description="Explicit flag to force Gemini Vision OCR.",
    )
    job_id: Optional[str] = Field(
        default=None,
        description="Optional tracking job ID correlation token.",
    )
