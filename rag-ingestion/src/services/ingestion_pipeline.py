"""End-to-end ingestion pipeline service orchestrating document parsing, enrichment, embedding, and syncing.

Coordinates the multi-stage ingestion lifecycle:
1. Binary Download: Fetches original `.pdf` / `.docx` binary from MinIO Object Storage or parses raw text.
2. Format Detection: Inspects MIME types and text density to choose between Digital PDF, DOCX, or Gemini Vision OCR.
3. Hierarchical AST Parsing: Deconstructs legal text into a structured tree (Chương > Mục > Điều > Khoản > Điểm).
4. Chunk Enrichment: Adds hierarchical breadcrumbs, fine range brackets, and vehicle classification tags.
5. Dense Vector Embedding: Produces 1024-dimension vector embeddings via configured BaseEmbedder.
6. Storage Sync: Persists points into Qdrant vector database and relational entities into PostgreSQL OLTP.
7. Redis Pub/Sub Milestones: Broadcasts progress step events across the `rag:ingestion:events` topic.
"""

import logging
from typing import Optional

from src.core.config import settings
from src.enrichers.chunk_composer import LegalChunkComposer
from src.parsers.document_detector import (
    DocumentDetector,
    ParserRecommendation,
)
from src.parsers.docx_parser import DocxParser
from src.parsers.legal_ast import LegalNodeParser
from src.parsers.ocr_vision_parser import OcrVisionParser
from src.parsers.pdf_digital_parser import PdfDigitalParser
from src.schemas.ingest import IngestionRequest
from src.services.embedder import BaseEmbedder, get_embedder
from src.services.minio_storage import minio_storage
from src.services.oltp_sync import OltpSyncService
from src.services.qdrant_sync import QdrantSyncService
from src.services.redis_publisher import redis_publisher

logger = logging.getLogger(__name__)


class IngestionPipeline:
    """Orchestrates end-to-end background ingestion: Detect -> Parse -> AST -> Enrich -> Embed -> Store.

    Attributes:
        detector (DocumentDetector): Analyzes file signatures and determines parser recommendation.
        pdf_parser (PdfDigitalParser): Extracts digital text layers from standard PDF decrees.
        docx_parser (DocxParser): Parses Microsoft Word .docx decree files.
        ocr_parser (OcrVisionParser): Transcribes scanned image PDFs using Google Gemini Flash Vision.
        composer (LegalChunkComposer): Enriches AST nodes with breadcrumb context and fine brackets.
        embedder (BaseEmbedder): Unified vector embedder instance instantiated via EmbedderFactory.
        qdrant_sync (QdrantSyncService): Upserts vector points into Qdrant collection.
        oltp_sync (OltpSyncService): Syncs relational metadata to PostgreSQL OLTP.
        minio_storage (MinioStorageService): Downloads raw document binaries from MinIO object storage.
    """

    def __init__(self, embedder: Optional[BaseEmbedder] = None) -> None:
        """Initialize pipeline sub-services and parser components."""
        self.detector = DocumentDetector()
        self.pdf_parser = PdfDigitalParser()
        self.docx_parser = DocxParser()
        self.ocr_parser = OcrVisionParser(
            api_key=settings.GEMINI_API_KEY, model_name=settings.GEMINI_OCR_MODEL
        )
        self.composer = LegalChunkComposer()
        self.embedder = embedder or get_embedder()
        self.qdrant_sync = QdrantSyncService(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            vector_size=settings.QDRANT_VECTOR_SIZE,
        )
        self.oltp_sync = OltpSyncService(db_url=settings.DATABASE_URL)
        self.minio_storage = minio_storage
        logger.info(
            f"Initialized IngestionPipeline with embedder '{type(self.embedder).__name__}' "
            f"(dim={self.embedder.vector_dim}), Qdrant '{settings.QDRANT_HOST}:{settings.QDRANT_PORT}', "
            f"collection '{settings.QDRANT_COLLECTION}'."
        )

    async def process_ingestion_async(self, req: IngestionRequest, job_id: str) -> None:
        """Execute complete document ingestion pipeline in the background.

        Args:
            req (IngestionRequest): Ingestion request DTO containing storage_key, doc_id, or content_text.
            job_id (str): Unique job tracking token for Redis Pub/Sub milestone broadcasting.
        """
        doc_code = req.doc_code or "LAW-DOC"
        doc_title = req.doc_title or doc_code
        filename = req.filename or "document.pdf"
        storage_key = req.storage_key

        logger.info(
            f"🚀 [Job: {job_id}] Starting ingestion pipeline for doc_code='{doc_code}' "
            f"(title='{doc_title}', filename='{filename}', storage_key='{storage_key}', doc_id='{req.doc_id}')"
        )

        try:
            # ─────────────────────────────────────────────────────────────────
            # STAGE 1: RESOLVE DOCUMENT CONTENT (MinIO Object Storage / Text)
            # ─────────────────────────────────────────────────────────────────
            logger.info(f"📥 [Job: {job_id}] Stage 1/9: Resolving document content source...")
            content_bytes: bytes = b""

            # Strategy 1A: Explicit MinIO storage key provided by API Gateway
            if storage_key:
                logger.info(
                    f"📥 [Job: {job_id}] Downloading binary from MinIO bucket using storage_key='{storage_key}'..."
                )
                content_bytes = self.minio_storage.download_file_bytes(storage_key)
            # Strategy 1B: Document ID provided (lookup storage_key from PostgreSQL OLTP)
            elif req.doc_id:
                logger.info(
                    f"📥 [Job: {job_id}] Looking up storage key for doc_id='{req.doc_id}' in PostgreSQL OLTP..."
                )
                doc_record = await self.oltp_sync.get_document_by_id(req.doc_id)
                if doc_record and doc_record.get("storage_key"):
                    storage_key = doc_record["storage_key"]
                    filename = doc_record.get("file_name") or filename
                    doc_code = doc_record.get("code") or doc_code
                    doc_title = doc_record.get("title") or doc_title
                    logger.info(
                        f"📥 [Job: {job_id}] Found document record in OLTP. Downloading storage_key='{storage_key}'..."
                    )
                    content_bytes = self.minio_storage.download_file_bytes(storage_key)
                elif req.content_text:
                    logger.info(
                        f"📥 [Job: {job_id}] Fallback to raw text payload for doc_id='{req.doc_id}'."
                    )
                    content_bytes = req.content_text.encode("utf-8")
            # Strategy 1C: Direct text/markdown scraped payload
            elif req.content_text:
                logger.info(f"📥 [Job: {job_id}] Using direct text content payload.")
                content_bytes = req.content_text.encode("utf-8")

            # Validate non-empty payload
            if not content_bytes:
                err_msg = "No document content found. Provide doc_id, storage_key, or content_text."
                logger.error(f"❌ [Job: {job_id}] {err_msg}")
                await redis_publisher.publish_event(
                    job_id,
                    doc_code,
                    "error",
                    {"error": err_msg},
                )
                return

            logger.info(
                f"✓ [Job: {job_id}] Stage 1 Complete: Successfully resolved {len(content_bytes)} bytes for '{filename}'."
            )

            # Emit Milestone 1: FILE_LOADED (15%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "FILE_LOADED",
                    "percent": 15,
                    "message": f"Tải lên tệp {filename} thành công ({len(content_bytes)} bytes).",
                },
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 2: FORMAT DETECTION & TEXT DENSITY ANALYSIS
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"🔍 [Job: {job_id}] Stage 2/9: Analyzing file signature and text density for '{filename}'..."
            )
            detection = self.detector.detect(filename=filename, content=content_bytes)
            logger.info(
                f"✓ [Job: {job_id}] Stage 2 Complete: Detected doc_type='{detection.doc_type.value}', "
                f"recommendation='{detection.recommendation.value}'"
            )

            # Emit Milestone 2: FORMAT_DETECTED (25%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "FORMAT_DETECTED",
                    "percent": 25,
                    "message": f"Định dạng nhận diện: {detection.doc_type.value}, Đề xuất: {detection.recommendation.value}",
                },
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 3: PARSING INTO STANDARDIZED LEGAL MARKDOWN
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"⚙️ [Job: {job_id}] Stage 3/9: Parsing raw document binary into standardized legal Markdown..."
            )
            if detection.recommendation == ParserRecommendation.OCR_VISION or req.is_scanned:
                logger.info(
                    f"👁️ [Job: {job_id}] Invoking Google Gemini Flash OCR transcriber (model: {settings.GEMINI_OCR_MODEL})..."
                )
                # Emit Milestone 3A: OCR_PROCESSING (35%)
                await redis_publisher.publish_event(
                    job_id,
                    doc_code,
                    "progress",
                    {
                        "step": "OCR_PROCESSING",
                        "percent": 35,
                        "message": "Đang thực hiện OCR qua Google Gemini Flash cho văn bản scan...",
                    },
                )
                markdown_text = self.ocr_parser.parse(content_bytes, filename=filename)
            elif detection.recommendation == ParserRecommendation.PDF_DIGITAL:
                logger.info(f"📄 [Job: {job_id}] Extracting digital PDF text layer via PyMuPDF...")
                markdown_text = self.pdf_parser.parse(content_bytes, filename=filename)
            elif detection.recommendation == ParserRecommendation.DOCX_PARSER:
                logger.info(
                    f"📑 [Job: {job_id}] Parsing Microsoft Word .docx paragraphs and headings..."
                )
                markdown_text = self.docx_parser.parse(content_bytes, filename=filename)
            else:
                logger.info(f"📝 [Job: {job_id}] Decoding UTF-8 raw text payload...")
                markdown_text = content_bytes.decode("utf-8", errors="ignore")

            logger.info(
                f"✓ [Job: {job_id}] Stage 3 Complete: Extracted {len(markdown_text)} characters of Markdown."
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 4: HIERARCHICAL AST PARSING (Chương > Điều > Khoản > Điểm)
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"🌳 [Job: {job_id}] Stage 4/9: Building hierarchical Legal AST (Chương -> Điều -> Khoản -> Điểm)..."
            )
            # Emit Milestone 4: AST_PARSED (50%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "AST_PARSED",
                    "percent": 50,
                    "message": "Đang trích xuất cây phân cấp Chương -> Điều -> Khoản -> Điểm...",
                },
            )
            ast_parser = LegalNodeParser(doc_code=doc_code, doc_title=doc_title)
            ast_nodes = ast_parser.parse_to_nodes(markdown_text)
            logger.info(
                f"✓ [Job: {job_id}] Stage 4 Complete: Extracted {len(ast_nodes)} structural AST nodes."
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 5: CHUNK ENRICHMENT (Breadcrumbs, Fines, Vehicle Tags, GPLX)
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"🏷️ [Job: {job_id}] Stage 5/9: Enriching leaf provisions with breadcrumbs, fine ranges, and vehicle tags..."
            )
            # Enrich every leaf provision with its parent context and cross-linked penalties
            enriched_chunks = self.composer.compose_chunks(ast_nodes)
            logger.info(
                f"✓ [Job: {job_id}] Stage 5 Complete: Composed {len(enriched_chunks)} enriched legal chunks."
            )

            # Emit Milestone 5: CHUNKS_ENRICHED (65%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "CHUNKS_ENRICHED",
                    "percent": 65,
                    "message": f"Đã sinh {len(enriched_chunks)} chunks với ngữ cảnh breadcrumbs và khung phạt.",
                },
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 6: VECTOR EMBEDDING GENERATION
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"🧠 [Job: {job_id}] Stage 6/9: Generating {self.embedder.vector_dim}-dim dense embeddings "
                f"for {len(enriched_chunks)} chunks via {type(self.embedder).__name__}..."
            )
            # Emit Milestone 6: EMBEDDINGS_GENERATED (80%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "EMBEDDINGS_GENERATED",
                    "percent": 80,
                    "message": f"Đang tạo vector nhúng {self.embedder.vector_dim}-chiều cho {len(enriched_chunks)} chunks...",
                },
            )
            chunk_texts = [c.enriched_text for c in enriched_chunks]
            embeddings = self.embedder.embed_documents(chunk_texts)
            logger.info(
                f"✓ [Job: {job_id}] Stage 6 Complete: Generated {len(embeddings)} embedding vectors."
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 7: QDRANT VECTOR UPSERTION
            # ─────────────────────────────────────────────────────────────────
            collection_name = settings.QDRANT_COLLECTION
            logger.info(
                f"🗄️ [Job: {job_id}] Stage 7/9: Upserting {len(enriched_chunks)} points into Qdrant "
                f"collection '{collection_name}'..."
            )
            points_count = self.qdrant_sync.upsert_chunks(
                collection_name=collection_name,
                chunks=enriched_chunks,
                embeddings=embeddings,
            )
            logger.info(
                f"✓ [Job: {job_id}] Stage 7 Complete: Successfully upserted {points_count} points into Qdrant collection '{collection_name}'."
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 8: POSTGRESQL OLTP METADATA SYNCHRONIZATION
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"💾 [Job: {job_id}] Stage 8/9: Syncing document metadata and {len(enriched_chunks)} chunks to PostgreSQL OLTP (kb='{req.kb_code}')..."
            )
            # Emit Milestone 8: STORAGE_SYNCED (95%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "STORAGE_SYNCED",
                    "percent": 95,
                    "message": f"Đã lưu trữ {len(enriched_chunks)} bản ghi vào OLTP và {points_count} points vào Qdrant.",
                },
            )
            await self.oltp_sync.sync_document_and_chunks(
                kb_code=req.kb_code,
                kb_name=req.kb_name,
                doc_code=doc_code,
                doc_title=doc_title,
                chunks=enriched_chunks,
                source_url=req.source_url,
                storage_key=storage_key,
                metadata=req.metadata,
            )
            logger.info(
                f"✓ [Job: {job_id}] Stage 8 Complete: Relational sync to PostgreSQL OLTP completed."
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 9: PIPELINE COMPLETION NOTIFICATION
            # ─────────────────────────────────────────────────────────────────
            logger.info(
                f"🎉 [Job: {job_id}] Stage 9/9: Pipeline successfully finished! "
                f"({len(enriched_chunks)} chunks, {points_count} points in '{collection_name}')"
            )
            # Emit Milestone 9: COMPLETED (100%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "complete",
                {
                    "step": "COMPLETED",
                    "percent": 100,
                    "status": "success",
                    "doc_code": doc_code,
                    "doc_title": doc_title,
                    "chunks_count": len(enriched_chunks),
                    "points_upserted": points_count,
                    "collection_name": collection_name,
                    "message": "Hoàn tất xử lý và đánh chỉ mục văn bản pháp luật giao thông.",
                },
            )
        except Exception as e:
            # Broadcast structured error event to Redis Pub/Sub for frontend UI error notification
            logger.error(
                f"❌ [Job: {job_id}] Ingestion failed for '{doc_code}': {e}", exc_info=True
            )
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "error",
                {
                    "step": "FAILED",
                    "error": str(e),
                    "message": f"Lỗi trong quá trình xử lý: {str(e)}",
                },
            )


ingestion_pipeline = IngestionPipeline()
