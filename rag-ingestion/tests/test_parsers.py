"""Unit tests for document parsers and adaptive document detector."""

import sys
import unittest
from unittest.mock import MagicMock, patch

from src.parsers.document_detector import DocumentDetector, DocumentType, ParserRecommendation
from src.parsers.docx_parser import DocxParser
from src.parsers.ocr_vision_parser import OcrVisionParser
from src.parsers.pdf_digital_parser import PdfDigitalParser


class TestDocumentDetector(unittest.TestCase):
    def setUp(self):
        self.detector = DocumentDetector()

    def test_detect_markdown_file(self):
        result = self.detector.detect(filename="decree_100.md", content=b"# CHUONG I\nDieu 1")
        self.assertEqual(result.doc_type, DocumentType.MARKDOWN)
        self.assertEqual(result.recommendation, ParserRecommendation.DIRECT_TEXT)
        self.assertFalse(result.is_scanned)

    def test_detect_docx_file(self):
        result = self.detector.detect(filename="decree_123.docx", content=b"PK\x03\x04fake_docx")
        self.assertEqual(result.doc_type, DocumentType.DOCX)
        self.assertEqual(result.recommendation, ParserRecommendation.DOCX_PARSER)
        self.assertFalse(result.is_scanned)

    def test_detect_digital_pdf(self):
        with patch.object(self.detector, "_analyze_pdf_density", return_value=(False, 10, 1200)):
            result = self.detector.detect(
                filename="decree_100_digital.pdf", content=b"%PDF-1.5 digital content"
            )
            self.assertEqual(result.doc_type, DocumentType.PDF)
            self.assertEqual(result.recommendation, ParserRecommendation.PDF_DIGITAL)
            self.assertFalse(result.is_scanned)
            self.assertEqual(result.page_count, 10)
            self.assertEqual(result.avg_chars_per_page, 1200)

    def test_detect_scanned_pdf(self):
        with patch.object(self.detector, "_analyze_pdf_density", return_value=(True, 5, 25)):
            result = self.detector.detect(
                filename="decree_100_scanned.pdf", content=b"%PDF-1.5 scanned image"
            )
            self.assertEqual(result.doc_type, DocumentType.PDF)
            self.assertEqual(result.recommendation, ParserRecommendation.OCR_VISION)
            self.assertTrue(result.is_scanned)
            self.assertEqual(result.page_count, 5)


class TestPdfDigitalParser(unittest.TestCase):
    def setUp(self):
        self.parser = PdfDigitalParser()

    def test_parse_digital_pdf_content(self):
        sample_text = (
            "CHƯƠNG II: HÀNH VI VI PHẠM\n"
            "Điều 5. Xử phạt người điều khiển xe ô tô\n"
            "1. Phạt tiền từ 200.000 đồng đến 400.000 đồng đối với một trong các hành vi vi phạm sau đây:"
        )
        with patch.object(self.parser, "_extract_text", return_value=sample_text):
            parsed = self.parser.parse(b"%PDF-1.4 mock", filename="test.pdf")
            self.assertIn("CHƯƠNG II", parsed)
            self.assertIn("Điều 5", parsed)
            self.assertIn("Phạt tiền từ 200.000 đồng", parsed)


class TestDocxParser(unittest.TestCase):
    def setUp(self):
        self.parser = DocxParser()

    def test_parse_docx_paragraphs_and_tables(self):
        with patch.object(
            self.parser,
            "_extract_elements",
            return_value=[
                {"type": "heading", "text": "CHƯƠNG I: QUY ĐỊNH CHUNG"},
                {"type": "paragraph", "text": "Điều 1. Phạm vi điều chỉnh"},
                {
                    "type": "paragraph",
                    "text": "Nghị định này quy định về xử phạt vi phạm hành chính trong lĩnh vực giao thông đường bộ.",
                },
            ],
        ):
            markdown = self.parser.parse(b"fake_docx_bytes", filename="test.docx")
            self.assertIn("# CHƯƠNG I", markdown)
            self.assertIn("## Điều 1", markdown)


class TestOcrVisionParser(unittest.TestCase):
    def setUp(self):
        self.parser = OcrVisionParser(api_key="test_fake_gemini_key")

    def test_transcribe_scanned_page_with_gemini(self):
        expected_text = (
            "# CHƯƠNG II: HÀNH VI VI PHẠM VÀ MỨC PHẠT\n\n"
            "## Điều 6. Xử phạt người điều khiển xe mô tô, xe gắn máy\n\n"
            "### Khoản 1\n"
            "Phạt tiền từ 100.000 đồng đến 200.000 đồng đối với một trong các hành vi:\n"
            "- Điểm a) Không chấp hành hiệu lệnh, chỉ dẫn của biển báo hiệu, vạch kẻ đường."
        )

        mock_response = MagicMock()
        mock_response.text = expected_text

        mock_client_instance = MagicMock()
        mock_client_instance.models.generate_content.return_value = mock_response

        mock_genai = MagicMock()
        mock_genai.Client.return_value = mock_client_instance

        mock_google = MagicMock()
        mock_google.genai = mock_genai

        with patch.dict(sys.modules, {"google": mock_google, "google.genai": mock_genai}):
            with patch.object(self.parser, "_pdf_to_images", return_value=[b"fake_image_page_1"]):
                result_markdown = self.parser.parse(b"%PDF scanned", filename="scanned_law.pdf")
                self.assertIn("CHƯƠNG II", result_markdown)
                self.assertIn("Điều 6", result_markdown)
                self.assertIn("100.000 đồng đến 200.000 đồng", result_markdown)


if __name__ == "__main__":
    unittest.main()
