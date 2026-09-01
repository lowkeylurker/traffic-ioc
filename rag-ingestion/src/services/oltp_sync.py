"""PostgreSQL OLTP sync service for structured knowledge storage using SQLAlchemy ORM models.

Persists relational metadata for `knowledge_base`, `knowledge_document`,
and `knowledge_chunk` tables in the PostgreSQL operational database, ensuring
synchronized transactional tracking alongside Qdrant vector embeddings.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.db import get_async_engine, get_async_session_factory
from src.enrichers.chunk_composer import EnrichedChunk
from src.models.oltp import KnowledgeBaseModel, KnowledgeChunkModel, KnowledgeDocumentModel

logger = logging.getLogger(__name__)


class OltpSyncService:
    """Synchronizes ingested legal documents and hierarchical chunks with PostgreSQL OLTP via SQLAlchemy ORM.

    Attributes:
        db_url (str): Database connection string.
        session_factory (async_sessionmaker[AsyncSession]): Async sessionmaker factory from core/db.py.
    """

    def __init__(self, db_url: str) -> None:
        """Initialize OLTP database synchronization service with SQLAlchemy async engine.

        Args:
            db_url (str): PostgreSQL connection URI.
        """
        self.db_url = db_url
        self.engine = get_async_engine(db_url)
        self.session_factory: async_sessionmaker[AsyncSession] = get_async_session_factory(db_url)

    async def get_document_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Fetch document metadata (code, title, storage_key, file_name) by document ID using ORM.

        Args:
            doc_id (str): UUID primary key of the target document record.

        Returns:
            Optional[Dict[str, Any]]: Dictionary of document attributes, or None if not found.
        """
        try:
            target_uuid = (
                uuid.UUID(doc_id) if isinstance(doc_id, str) and len(doc_id) == 36 else doc_id
            )
            async with self.session_factory() as session:
                stmt = select(KnowledgeDocumentModel).where(
                    KnowledgeDocumentModel.id == target_uuid
                )
                result = await session.execute(stmt)
                doc = result.scalar_one_or_none()
                if doc:
                    return {
                        "id": str(doc.id),
                        "kb_id": str(doc.kb_id),
                        "code": doc.code,
                        "title": doc.title,
                        "file_name": doc.file_name,
                        "storage_key": doc.storage_key,
                        "source_url": doc.source_url,
                        "status": doc.status,
                        "chunk_count": doc.chunk_count,
                        "metadata": doc.metadata_,
                    }
        except Exception as e:
            logger.warning(
                f"Could not fetch document {doc_id} directly via SQLAlchemy ORM query: {e}"
            )
        return None

    async def sync_document_and_chunks(
        self,
        kb_code: str,
        kb_name: str,
        doc_code: str,
        doc_title: str,
        chunks: List[EnrichedChunk],
        source_url: Optional[str] = None,
        storage_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Synchronizes knowledge_base, knowledge_document, and knowledge_chunk records using SQLAlchemy models.

        Args:
            kb_code (str): Knowledge base catalog code.
            kb_name (str): Knowledge base display name.
            doc_code (str): Document reference code.
            doc_title (str): Full title of the decree.
            chunks (List[EnrichedChunk]): Collection of decomposed enriched legal chunks.
            source_url (Optional[str]): Source portal URL or S3 URI.
            storage_key (Optional[str]): MinIO bucket object key path.
            metadata (Optional[Dict[str, Any]]): Arbitrary custom metadata dictionary.

        Returns:
            Dict[str, Any]: Summary dictionary with generated IDs and count of synced chunk records.
        """
        return await self._execute_sync(
            kb_code=kb_code,
            kb_name=kb_name,
            doc_code=doc_code,
            doc_title=doc_title,
            chunks=chunks,
            source_url=source_url,
            storage_key=storage_key,
            metadata=metadata or {},
        )

    async def _execute_sync(
        self,
        kb_code: str,
        kb_name: str,
        doc_code: str,
        doc_title: str,
        chunks: List[EnrichedChunk],
        source_url: Optional[str] = None,
        storage_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute transactional relational sync and batch insert with SQLAlchemy ORM models.

        Args:
            kb_code (str): Knowledge base identifier.
            kb_name (str): Knowledge base name.
            doc_code (str): Document code.
            doc_title (str): Document title.
            chunks (List[EnrichedChunk]): List of AST enriched chunks.
            source_url (Optional[str]): Source URL.
            storage_key (Optional[str]): MinIO object storage key.
            metadata (Optional[Dict[str, Any]]): Metadata payload.

        Returns:
            Dict[str, Any]: Sync result dictionary with UUID mappings and synced status.
        """
        effective_kb_code = kb_code or "vietnam_traffic_laws"
        effective_kb_name = kb_name or "Bộ Pháp điển & Nghị định Giao thông Đường bộ Việt Nam"

        deterministic_kb_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"kb:{effective_kb_code}")
        deterministic_doc_uuid = uuid.uuid5(
            uuid.NAMESPACE_DNS, f"doc:{effective_kb_code}:{doc_code}"
        )

        logger.info(
            f"Executing transactional SQLAlchemy sync for document '{doc_code}' ({len(chunks)} chunks)..."
        )

        async with self.session_factory() as session:
            async with session.begin():
                # 1. Upsert KnowledgeBaseModel
                kb_stmt = (
                    pg_insert(KnowledgeBaseModel)
                    .values(
                        id=deterministic_kb_uuid,
                        code=effective_kb_code,
                        name=effective_kb_name,
                        qdrant_collection="vietnam_traffic_laws",
                    )
                    .on_conflict_do_update(
                        index_elements=[KnowledgeBaseModel.code],
                        set_={
                            "name": effective_kb_name,
                            "qdrant_collection": "vietnam_traffic_laws",
                        },
                    )
                    .returning(KnowledgeBaseModel.id)
                )
                kb_res = await session.execute(kb_stmt)
                actual_kb_id = kb_res.scalar_one()

                # 2. Upsert KnowledgeDocumentModel
                doc_stmt = (
                    pg_insert(KnowledgeDocumentModel)
                    .values(
                        id=deterministic_doc_uuid,
                        kb_id=actual_kb_id,
                        code=doc_code,
                        title=doc_title,
                        source_url=source_url,
                        storage_key=storage_key,
                        status="COMPLETED",
                        chunk_count=len(chunks),
                        metadata_=metadata or {},
                    )
                    .on_conflict_do_update(
                        index_elements=[KnowledgeDocumentModel.kb_id, KnowledgeDocumentModel.code],
                        set_={
                            "title": doc_title,
                            "source_url": func.coalesce(
                                source_url, KnowledgeDocumentModel.source_url
                            ),
                            "storage_key": func.coalesce(
                                storage_key, KnowledgeDocumentModel.storage_key
                            ),
                            "status": "COMPLETED",
                            "chunk_count": len(chunks),
                            "metadata": metadata or {},
                            "error_message": None,
                            "updated_at": func.now(),
                        },
                    )
                    .returning(KnowledgeDocumentModel.id)
                )
                doc_res = await session.execute(doc_stmt)
                actual_doc_id = doc_res.scalar_one()

                # 3. Clean existing chunks for this document (idempotent re-indexing)
                del_stmt = delete(KnowledgeChunkModel).where(
                    KnowledgeChunkModel.document_id == actual_doc_id
                )
                await session.execute(del_stmt)

                # 4. Batch insert KnowledgeChunkModel instances
                if chunks:
                    chunk_instances = []
                    for idx, chunk in enumerate(chunks):
                        try:
                            chunk_uuid = uuid.UUID(chunk.id) if chunk.id else uuid.uuid4()
                        except (ValueError, AttributeError):
                            chunk_uuid = uuid.uuid4()

                        chunk_instances.append(
                            KnowledgeChunkModel(
                                id=chunk_uuid,
                                document_id=actual_doc_id,
                                chunk_index=idx,
                                breadcrumb=chunk.breadcrumb
                                or f"Điều {chunk.article_number or idx}",
                                content=chunk.enriched_text or chunk.raw_content or "",
                                qdrant_point_id=chunk_uuid,
                                metadata_=chunk.metadata or {},
                            )
                        )
                    session.add_all(chunk_instances)

        logger.info(
            f"✓ Successfully synced document '{doc_code}' (id: {actual_doc_id}) and {len(chunks)} chunks to PostgreSQL OLTP."
        )

        return {
            "kb_id": str(actual_kb_id),
            "kb_code": effective_kb_code,
            "doc_id": str(actual_doc_id),
            "doc_code": doc_code,
            "storage_key": storage_key,
            "synced_chunks": len(chunks),
            "status": "success",
        }

    async def close(self) -> None:
        """Dispose the underlying SQLAlchemy async engine connection pool."""
        await self.engine.dispose()
