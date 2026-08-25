"""Digital PDF parser with layout extraction for Vietnamese legal documents."""

import io
from typing import Union


class PdfDigitalParser:
    """Extracts digital text from PDFs preserving legal structure and headings."""

    def parse(self, content: Union[bytes, str], filename: str = "") -> str:
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        return self._extract_text(content_bytes)

    def _extract_text(self, content_bytes: bytes) -> str:
        # Try PyMuPDF / fitz
        try:
            import fitz
            doc = fitz.open(stream=content_bytes, filetype="pdf")
            pages_text = []
            for page in doc:
                text = page.get_text("text")
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
                    text = page.extract_text()
                    if text and text.strip():
                        pages_text.append(text.strip())
                return "\n\n".join(pages_text)
        except Exception:
            pass

        # Fallback string decode
        return content_bytes.decode("utf-8", errors="ignore")
