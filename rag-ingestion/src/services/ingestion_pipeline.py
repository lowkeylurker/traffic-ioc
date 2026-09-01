"""End-to-end ingestion pipeline service orchestrating document parsing, enrichment, embedding, and syncing.

Coordinates the multi-stage ingestion lifecycle:
1. Binary Download: Fetches original `.pdf` / `.docx` binary from MinIO Object Storage or parses raw text.
2. Format Detection: Inspects MIME types and text density to choose between Digital PDF, DOCX, or Gemini Vision OCR.
3. Hierarchical AST Parsing: Deconstructs legal text into a structured tree (Chương > Mục > Điều > Khoản > Điểm).
4. Chunk Enrichment: Adds hierarchical breadcrumbs, fine range brackets, and vehicle classification tags.
5. Dense Vector Embedding: Produces 1024-dimension BAAI/bge-m3 dense vector embeddings via local Ollama.
6. Storage Sync: Persists points into Qdrant vector database and relational entities into PostgreSQL OLTP.
7. Redis Pub/Sub Milestones: Broadcasts progress step events across the `rag:ingestion:events` topic.
"""

import logging
from typing import Optional

from src.config import settings
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

        try:
            # ─────────────────────────────────────────────────────────────────
            # STAGE 1: RESOLVE DOCUMENT CONTENT (MinIO Object Storage / Text)
            # ─────────────────────────────────────────────────────────────────
            content_bytes: bytes = b""

            # Strategy 1A: Explicit MinIO storage key provided by API Gateway
            if storage_key:
                content_bytes = self.minio_storage.download_file_bytes(storage_key)
            # Strategy 1B: Document ID provided (lookup storage_key from PostgreSQL OLTP)
            elif req.doc_id:
                doc_record = self.oltp_sync.get_document_by_id(req.doc_id)
                if doc_record and doc_record.get("storage_key"):
                    storage_key = doc_record["storage_key"]
                    filename = doc_record.get("file_name") or filename
                    doc_code = doc_record.get("code") or doc_code
                    doc_title = doc_record.get("title") or doc_title
                    content_bytes = self.minio_storage.download_file_bytes(storage_key)
                elif req.content_text:
                    content_bytes = req.content_text.encode("utf-8")
            # Strategy 1C: Direct text/markdown scraped payload
            elif req.content_text:
                content_bytes = req.content_text.encode("utf-8")

            # Validate non-empty payload
            if not content_bytes:
                await redis_publisher.publish_event(
                    job_id,
                    doc_code,
                    "error",
                    {
                        "error": "No document content found. Provide doc_id, storage_key, or content_text."
                    },
                )
                return

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
            # Analyze character density per page (< 100 chars/page indicates scanned PDF)
            detection = self.detector.detect(filename=filename, content=content_bytes)

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
            if detection.recommendation == ParserRecommendation.OCR_VISION or req.is_scanned:
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
                # Fast digital vector PDF layer text extraction via PyMuPDF
                markdown_text = self.pdf_parser.parse(content_bytes, filename=filename)
            elif detection.recommendation == ParserRecommendation.DOCX_PARSER:
                # Word .docx paragraph & heading extraction
                markdown_text = self.docx_parser.parse(content_bytes, filename=filename)
            else:
                markdown_text = content_bytes.decode("utf-8", errors="ignore")

            # ─────────────────────────────────────────────────────────────────
            # STAGE 4: HIERARCHICAL AST PARSING (Chương > Điều > Khoản > Điểm)
            # ─────────────────────────────────────────────────────────────────
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

            # ─────────────────────────────────────────────────────────────────
            # STAGE 5: CHUNK ENRICHMENT (Breadcrumbs, Fines, Vehicle Tags, GPLX)
            # ─────────────────────────────────────────────────────────────────
            # Enrich every leaf provision with its parent context and cross-linked penalties
            enriched_chunks = self.composer.compose_chunks(ast_nodes)

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
            # STAGE 6: VECTOR EMBEDDING GENERATION (Ollama BAAI/bge-m3)
            # ─────────────────────────────────────────────────────────────────
            # Emit Milestone 6: EMBEDDINGS_GENERATED (80%)
            await redis_publisher.publish_event(
                job_id,
                doc_code,
                "progress",
                {
                    "step": "EMBEDDINGS_GENERATED",
                    "percent": 80,
                    "message": f"Đang tạo vector nhúng 1024-chiều (Ollama bge-m3) cho {len(enriched_chunks)} chunks...",
                },
            )
            chunk_texts = [c.enriched_text for c in enriched_chunks]
            embeddings = self.embedder.embed_documents(chunk_texts)

            # ─────────────────────────────────────────────────────────────────
            # STAGE 7: QDRANT VECTOR UPSERTION
            # ─────────────────────────────────────────────────────────────────
            collection_name = settings.QDRANT_COLLECTION
            points_count = self.qdrant_sync.upsert_chunks(
                collection_name=collection_name,
                chunks=enriched_chunks,
                embeddings=embeddings,
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 8: POSTGRESQL OLTP METADATA SYNCHRONIZATION
            # ─────────────────────────────────────────────────────────────────
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
            self.oltp_sync.sync_document_and_chunks(
                kb_code=req.kb_code,
                kb_name=req.kb_name,
                doc_code=doc_code,
                doc_title=doc_title,
                chunks=enriched_chunks,
                source_url=req.source_url,
                storage_key=storage_key,
                metadata=req.metadata,
            )

            # ─────────────────────────────────────────────────────────────────
            # STAGE 9: PIPELINE COMPLETION NOTIFICATION
            # ─────────────────────────────────────────────────────────────────
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
            logger.error(f"Failed ingestion for {doc_code} (job {job_id}): {e}", exc_info=True)
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
