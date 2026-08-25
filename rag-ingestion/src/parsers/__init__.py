"""Parsers module for adaptive document loading and legal OCR."""

from src.parsers.document_detector import (
    DetectionResult,
    DocumentDetector,
    DocumentType,
    ParserRecommendation,
)
from src.parsers.docx_parser import DocxParser
from src.parsers.ocr_vision_parser import OcrVisionParser
from src.parsers.pdf_digital_parser import PdfDigitalParser

__all__ = [
    "DocumentDetector",
    "DocumentType",
    "ParserRecommendation",
    "DetectionResult",
    "PdfDigitalParser",
    "DocxParser",
    "OcrVisionParser",
]
