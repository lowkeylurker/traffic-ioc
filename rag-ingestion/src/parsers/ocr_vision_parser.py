"""OCR Vision parser leveraging Google Gemini Flash for scanned legal PDF transcription.

Converts rasterized PDF pages into 200-DPI PNG pixmaps and utilizes Google Gemini 1.5 Flash
Vision API to transcribe Vietnamese decree pages into structured legal Markdown with
high-fidelity diacritic accuracy and preserved legal typography.
"""

import os
from typing import List, Optional, Union

LEGAL_OCR_SYSTEM_PROMPT = """Bạn là trợ lý AI chuyên gia số hóa và chuyển đổi văn bản pháp luật giao thông Việt Nam từ ảnh quét scan sang định dạng Markdown cấu trúc chuẩn xác 100%.

QUY TẮC CẤU TRÚC:
1. Giữ nguyên toàn bộ số hiệu, dấu chấm, dấu phẩy, mức tiền phạt và ký hiệu pháp lý.
2. Cấu trúc hóa các phân cấp văn bản theo Markdown:
   - Chương: `# CHƯƠNG [I/II/...] [Tên chương]`
   - Mục (nếu có): `## MỤC [1/2/...] [Tên mục]`
   - Điều: `## Điều [X]. [Tiêu đề điều]`
   - Khoản: `### Khoản [Y]` hoặc `Y. [Nội dung khoản]`
   - Điểm: `- Điểm [a/b/c/...] [Nội dung điểm]`
3. Không lược bỏ bất kỳ điều khoản, bảng biểu hoặc phụ lục nào.
4. Trả về nội dung Markdown thuần túy, không bọc trong ```markdown ... ```.
"""


class OcrVisionParser:
    """Uses Google Gemini 1.5 Flash Vision to transcribe scanned Vietnamese decree PDFs.

    Attributes:
        api_key (str): Google Gemini API token.
        model_name (str): Vision model identifier (default: "gemini-1.5-flash").
    """

    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-1.5-flash") -> None:
        """Initialize OCR Vision parser.

        Args:
            api_key (Optional[str]): Gemini API key token.
            model_name (str): Gemini model identifier.
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model_name = model_name

    def parse(self, content: Union[bytes, str], filename: str = "") -> str:
        """Render scanned PDF pages to images and transcribe into legal Markdown.

        Args:
            content (Union[bytes, str]): Binary PDF bytes.
            filename (str): Optional source filename for context.

        Returns:
            str: Transcribed Markdown text stitched across all pages.
        """
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        images = self._pdf_to_images(content_bytes)

        if not images:
            return content_bytes.decode("utf-8", errors="ignore")

        transcribed_pages = []
        for img_bytes in images:
            page_text = self._transcribe_image(img_bytes)
            if page_text and str(page_text).strip():
                transcribed_pages.append(str(page_text).strip())

        return "\n\n".join(transcribed_pages)

    def _pdf_to_images(self, content_bytes: bytes) -> List[bytes]:
        """Rasterize PDF pages to 200 DPI PNG byte buffers using PyMuPDF.

        Args:
            content_bytes (bytes): Raw PDF binary.

        Returns:
            List[bytes]: List of PNG image byte arrays.
        """
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=content_bytes, filetype="pdf")
            images = []
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                images.append(pix.tobytes("png"))
            return images
        except Exception:
            # Fallback: treat entire content as single image byte stream if non-empty
            if content_bytes:
                return [content_bytes]
            return []

    def _transcribe_image(self, image_bytes: bytes) -> str:
        """Invoke Google Gemini Vision API to transcribe a single page image into structured Markdown.

        Args:
            image_bytes (bytes): PNG image byte array.

        Returns:
            str: Transcribed Markdown text for the page.
        """
        try:
            import google.generativeai as genai

            if self.api_key:
                genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model_name)

            image_part = {
                "mime_type": "image/png",
                "data": image_bytes,
            }

            response = model.generate_content([LEGAL_OCR_SYSTEM_PROMPT, image_part])
            if hasattr(response, "text"):
                return str(response.text)
            return str(response)
        except Exception as e:
            # Fallback / Mock
            return f"<!-- OCR Transcribe fallback: {str(e)} -->"
