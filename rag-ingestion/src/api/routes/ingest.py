"""FastAPI ingestion routes and end-to-end document processing pipeline."""

import base64
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from src.config import settings
from src.enrichers.chunk_composer import LegalChunkComposer
from src.parsers.document_detector import (
    DocumentDetector,
    DocumentType,
    ParserRecommendation,
)
from src.parsers.docx_parser import DocxParser
from src.parsers.legal_ast import LegalNodeParser
from src.parsers.ocr_vision_parser import OcrVisionParser
from src.parsers.pdf_digital_parser import PdfDigitalParser
from src.services.embedder import OllamaEmbedder
from src.services.oltp_sync import OltpSyncService
from src.services.qdrant_sync import QdrantSyncService

try:
    from pydantic import BaseModel, Field
except ImportError:
    # Lightweight fallback if pydantic is not loaded in testing environment
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

        def dict(self):
            return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


class IngestionRequest(BaseModel):
    kb_code: str = "vietnam_traffic_legislation"
    kb_name: str = "Cơ sở dữ liệu Pháp luật Giao thông Việt Nam"
    doc_code: str = ""
    doc_title: str = ""
    source_url: Optional[str] = None
    filename: str = "document.md"
    content_text: Optional[str] = None
    content_base64: Optional[str] = None
    is_scanned: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


class IngestionResponse(BaseModel):
    status: str
    doc_code: str
    doc_title: str
    chunks_count: int
    points_upserted: int
    collection_name: str
    message: str = "Document processed and indexed successfully"


class IngestionPipeline:
    """Orchestrates end-to-end ingestion: Detect -> Parse -> AST -> Enrich -> Embed -> Store."""

    def __init__(self):
        self.detector = DocumentDetector()
        self.pdf_parser = PdfDigitalParser()
        self.docx_parser = DocxParser()
        self.ocr_parser = OcrVisionParser(api_key=settings.GEMINI_API_KEY, model_name=settings.GEMINI_OCR_MODEL)
        self.composer = LegalChunkComposer()
        self.embedder = OllamaEmbedder(base_url=settings.OLLAMA_URL, model_name=settings.OLLAMA_EMBED_MODEL)
        self.qdrant_sync = QdrantSyncService(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT, vector_size=settings.QDRANT_VECTOR_SIZE)
        self.oltp_sync = OltpSyncService(db_url=settings.DATABASE_URL)

    def process_ingestion(self, req: IngestionRequest) -> IngestionResponse:
        # 1. Resolve raw content bytes or text
        if req.content_base64:
            content_bytes = base64.b64decode(req.content_base64)
        elif req.content_text:
            content_bytes = req.content_text.encode("utf-8")
        else:
            raise ValueError("Either content_text or content_base64 must be provided.")

        # 2. Detect document format & scan density
        detection = self.detector.detect(filename=req.filename, content=content_bytes)

        # 3. Parse into structured Legal Markdown
        if detection.recommendation == ParserRecommendation.OCR_VISION or req.is_scanned:
            markdown_text = self.ocr_parser.parse(content_bytes, filename=req.filename)
        elif detection.recommendation == ParserRecommendation.PDF_DIGITAL:
            markdown_text = self.pdf_parser.parse(content_bytes, filename=req.filename)
        elif detection.recommendation == ParserRecommendation.DOCX_PARSER:
            markdown_text = self.docx_parser.parse(content_bytes, filename=req.filename)
        else:
            markdown_text = content_bytes.decode("utf-8", errors="ignore")

        # 4. AST Hierarchical Parsing
        ast_parser = LegalNodeParser(doc_code=req.doc_code, doc_title=req.doc_title)
        ast_nodes = ast_parser.parse_to_nodes(markdown_text)

        # 5. Enrich chunks with breadcrumbs, fine ranges, and supplementary cross-linking
        enriched_chunks = self.composer.compose_chunks(ast_nodes)

        # 6. Generate dense vector embeddings via Ollama bge-m3
        chunk_texts = [c.enriched_text for c in enriched_chunks]
        embeddings = self.embedder.embed_documents(chunk_texts)

        # 7. Sync vector embeddings to Qdrant collection
        collection_name = settings.QDRANT_COLLECTION
        points_count = self.qdrant_sync.upsert_chunks(
            collection_name=collection_name,
            chunks=enriched_chunks,
            embeddings=embeddings,
        )

        # 8. Sync relational tables to PostgreSQL OLTP
        self.oltp_sync.sync_document_and_chunks(
            kb_code=req.kb_code,
            kb_name=req.kb_name,
            doc_code=req.doc_code,
            doc_title=req.doc_title,
            chunks=enriched_chunks,
            source_url=req.source_url,
            metadata=req.metadata,
        )

        return IngestionResponse(
            status="success",
            doc_code=req.doc_code,
            doc_title=req.doc_title,
            chunks_count=len(enriched_chunks),
            points_upserted=points_count,
            collection_name=collection_name,
            message="Document parsed, enriched, embedded, and synced successfully",
        )


pipeline_instance = IngestionPipeline()

try:
    from fastapi import APIRouter, File, HTTPException, UploadFile
    router = APIRouter(prefix="/ingest/traffic-law", tags=["Ingestion"])

    @router.post("/process", response_model=IngestionResponse)
    async def process_traffic_law_endpoint(request: IngestionRequest):
        try:
            return pipeline_instance.process_ingestion(request)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/upload")
    async def upload_traffic_law_file(
        kb_code: str = "vietnam_traffic_legislation",
        doc_code: str = "LAW-CUSTOM",
        doc_title: str = "Custom Traffic Regulation",
        file: UploadFile = File(...),
    ):
        content_bytes = await file.read()
        req = IngestionRequest(
            kb_code=kb_code,
            doc_code=doc_code,
            doc_title=doc_title,
            filename=file.filename or "upload.pdf",
            content_base64=base64.b64encode(content_bytes).decode("utf-8"),
        )
        return pipeline_instance.process_ingestion(req)

except ImportError:
    router = None  # type: ignore
