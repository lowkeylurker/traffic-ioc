"""Celery task definitions and worker execution handlers."""

from src.tasks.ingestion_tasks import process_document_ingestion_task

__all__ = ["process_document_ingestion_task"]
