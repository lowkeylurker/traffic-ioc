"""Adaptive document type detector and density analyzer.

Inspects document file signatures, extensions, and character densities across PDF pages
to intelligently route files between standard digital PDF extraction, DOCX parsing, or
multimodal Google Gemini Vision OCR for rasterized scanned documents.
"""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Tuple, Union


class DocumentType(str, Enum):
    """Enumeration of supported document format categories."""

    PDF = "pdf"
    DOCX = "docx"
    MARKDOWN = "markdown"
    TEXT = "text"
    UNKNOWN = "unknown"


class ParserRecommendation(str, Enum):
    """Parser execution strategies recommended based on document inspection."""

    PDF_DIGITAL = "pdf_digital"
    OCR_VISION = "ocr_vision"
    DOCX_PARSER = "docx_parser"
    DIRECT_TEXT = "direct_text"


@dataclass
class DetectionResult:
    """Diagnostic outcome of document format analysis and character density inspection.

    Attributes:
        doc_type (DocumentType): Detected file type enum.
        recommendation (ParserRecommendation): Recommended processing parser strategy.
        is_scanned (bool): True if character density falls below the digital threshold (< 100 chars/page).
        page_count (int): Total number of detected pages.
        avg_chars_per_page (float): Average character count per page.
        raw_size_bytes (int): Total size in bytes.
    """

    doc_type: DocumentType
    recommendation: ParserRecommendation
    is_scanned: bool
    page_count: int
    avg_chars_per_page: float
    raw_size_bytes: int


class DocumentDetector:
    """Detects document format and whether a PDF is digital text or a scanned raster image.

    Attributes:
        SCANNED_THRESHOLD_CHARS (int): Average characters per page threshold below which
            a PDF is classified as a scanned image requiring OCR (default: 100).
    """

    SCANNED_THRESHOLD_CHARS = 100

    def detect(self, filename: str, content: Union[bytes, str]) -> DetectionResult:
        """Inspect file extension, magic bytes, and page density to determine the optimal parser.

        Decision workflow:
        1. Markdown/Text: Routes to direct text processing without binary overhead.
        2. Word (.docx): Routes to python-docx paragraph/table extractor.
        3. PDF: Inspects text density per page using PyMuPDF. If average characters < 100/page,
           classifies document as a scanned raster PDF requiring Gemini Vision OCR.
           Otherwise, uses fast digital PDF extraction.

        Args:
            filename (str): Name of the file with extension.
            content (Union[bytes, str]): Binary bytes or decoded text string.

        Returns:
            DetectionResult: Complete detection diagnostics and parser recommendation.
        """
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        ext = os.path.splitext(filename)[1].lower().strip(".")
        size_bytes = len(content_bytes)

        # 1. Plain Markdown
        if ext in ("md", "markdown"):
            return DetectionResult(
                doc_type=DocumentType.MARKDOWN,
                recommendation=ParserRecommendation.DIRECT_TEXT,
                is_scanned=False,
                page_count=1,
                avg_chars_per_page=len(content_bytes.decode("utf-8", errors="ignore")),
                raw_size_bytes=size_bytes,
            )
        # 2. Microsoft Word DOCX
        elif ext in ("docx", "doc"):
            return DetectionResult(
                doc_type=DocumentType.DOCX,
                recommendation=ParserRecommendation.DOCX_PARSER,
                is_scanned=False,
                page_count=1,
                avg_chars_per_page=0,
                raw_size_bytes=size_bytes,
            )
        # 3. PDF (or files with %PDF- magic signature)
        elif ext == "pdf" or content_bytes.startswith(b"%PDF"):
            is_scanned, page_count, avg_chars = self._analyze_pdf_density(content_bytes)
            # Route to OCR if text density is under threshold (scanned image), else digital extractor
            rec = (
                ParserRecommendation.OCR_VISION if is_scanned else ParserRecommendation.PDF_DIGITAL
            )
            return DetectionResult(
                doc_type=DocumentType.PDF,
                recommendation=rec,
                is_scanned=is_scanned,
                page_count=page_count,
                avg_chars_per_page=avg_chars,
                raw_size_bytes=size_bytes,
            )
        # 4. Fallback Generic Plain Text
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
        """Analyze text character count per page using PyMuPDF (fitz).

        Scanned legal PDFs typically contain embedded full-page JPEG/PNG scans with
        either zero selectable text or only minor header/footer stamps (< 100 characters/page).

        Args:
            content_bytes (bytes): Raw binary bytes of the PDF.

        Returns:
            Tuple[bool, int, float]: (is_scanned, page_count, avg_chars_per_page).
        """
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=content_bytes, filetype="pdf")
            page_count = len(doc)
            if page_count == 0:
                return True, 0, 0.0

            # Accumulate text length across all pages
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
