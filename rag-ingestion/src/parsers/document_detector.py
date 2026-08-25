"""Adaptive document type detector and density analyzer."""

import io
import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple, Union


class DocumentType(str, Enum):
    PDF = "pdf"
    DOCX = "docx"
    MARKDOWN = "markdown"
    TEXT = "text"
    UNKNOWN = "unknown"


class ParserRecommendation(str, Enum):
    PDF_DIGITAL = "pdf_digital"
    OCR_VISION = "ocr_vision"
    DOCX_PARSER = "docx_parser"
    DIRECT_TEXT = "direct_text"


@dataclass
class DetectionResult:
    doc_type: DocumentType
    recommendation: ParserRecommendation
    is_scanned: bool
    page_count: int
    avg_chars_per_page: float
    raw_size_bytes: int


class DocumentDetector:
    """Detects document format and whether a PDF is digital text or a scanned raster image."""

    # Threshold for average characters per page to consider a PDF digital vs scanned image
    SCANNED_THRESHOLD_CHARS = 100

    def detect(self, filename: str, content: Union[bytes, str]) -> DetectionResult:
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        ext = os.path.splitext(filename)[1].lower().strip(".")
        size_bytes = len(content_bytes)

        if ext in ("md", "markdown"):
            return DetectionResult(
                doc_type=DocumentType.MARKDOWN,
                recommendation=ParserRecommendation.DIRECT_TEXT,
                is_scanned=False,
                page_count=1,
                avg_chars_per_page=len(content_bytes.decode("utf-8", errors="ignore")),
                raw_size_bytes=size_bytes,
            )
        elif ext in ("docx", "doc"):
            return DetectionResult(
                doc_type=DocumentType.DOCX,
                recommendation=ParserRecommendation.DOCX_PARSER,
                is_scanned=False,
                page_count=1,
                avg_chars_per_page=0,
                raw_size_bytes=size_bytes,
            )
        elif ext == "pdf" or content_bytes.startswith(b"%PDF"):
            is_scanned, page_count, avg_chars = self._analyze_pdf_density(content_bytes)
            rec = ParserRecommendation.OCR_VISION if is_scanned else ParserRecommendation.PDF_DIGITAL
            return DetectionResult(
                doc_type=DocumentType.PDF,
                recommendation=rec,
                is_scanned=is_scanned,
                page_count=page_count,
                avg_chars_per_page=avg_chars,
                raw_size_bytes=size_bytes,
            )
        else:
            return DetectionResult(
                doc_type=DocumentType.TEXT,
                recommendation=ParserRecommendation.DIRECT_TEXT,
                is_scanned=False,
                page_count=1,
                avg_chars_per_page=len(content_bytes.decode("utf-8", errors="ignore")),
                raw_size_bytes=size_bytes,
            )

    def _analyze_pdf_density(self, content_bytes: bytes) -> Tuple[bool, int, float]:
        """Analyzes text character count per page using pymupdf or pdfplumber if available."""
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content_bytes, filetype="pdf")
            page_count = len(doc)
            if page_count == 0:
                return True, 0, 0.0

            total_chars = 0
            for page in doc:
                total_chars += len(page.get_text())

            avg_chars = total_chars / page_count
            is_scanned = avg_chars < self.SCANNED_THRESHOLD_CHARS
            return is_scanned, page_count, avg_chars
        except Exception:
            # Fallback estimation based on content length or default
            page_count = 1
            avg_chars = len(content_bytes) / 100.0
            is_scanned = False
            return is_scanned, page_count, avg_chars
