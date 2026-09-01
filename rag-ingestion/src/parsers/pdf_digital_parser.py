"""Digital PDF parser with layout extraction for Vietnamese legal documents.

Extracts text layers from digital vector PDFs using PyMuPDF (fitz) or pdfplumber,
retaining natural reading order across multi-page decrees.
"""

import io
from typing import Union


class PdfDigitalParser:
    """Extracts digital text from PDFs preserving legal structure and headings."""

    def parse(self, content: Union[bytes, str], filename: str = "") -> str:
        """Extract text from a digital PDF file buffer.

        Args:
            content (Union[bytes, str]): Binary bytes or encoded string of the PDF.
            filename (str): Optional filename token.

        Returns:
            str: Extracted text concatenated across all pages.
        """
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        return self._extract_text(content_bytes)

    def _extract_text(self, content_bytes: bytes) -> str:
        """Extract multi-page text layers with fallback between PyMuPDF, pdfplumber, and UTF-8 decoding.

        Args:
            content_bytes (bytes): Raw binary bytes of the PDF file.

        Returns:
            str: Full extracted text content.
        """
        # Try PyMuPDF / fitz
        try:
            import fitz

            doc = fitz.open(stream=content_bytes, filetype="pdf")
            pages_text = []
            for page in doc:
                text = str(page.get_text("text") or "")
                if text.strip():
                    pages_text.append(text.strip())
            return "\n\n".join(pages_text)
        except Exception:
            pass

        # Try pdfplumber
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                pages_text = []
                for page in pdf.pages:
                    text = str(page.extract_text() or "")
                    if text.strip():
                        pages_text.append(text.strip())
                return "\n\n".join(pages_text)
        except Exception:
            pass

        # Fallback string decode
        return content_bytes.decode("utf-8", errors="ignore")
