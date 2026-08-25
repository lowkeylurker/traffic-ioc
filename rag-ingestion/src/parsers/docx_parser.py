"""DOCX parser converting Vietnamese legal Word documents to structured Markdown."""

import io
from typing import Any, Dict, List, Union


class DocxParser:
    """Parses Word .docx documents into structured Markdown for legal AST processing."""

    def parse(self, content: Union[bytes, str], filename: str = "") -> str:
        content_bytes = content.encode("utf-8") if isinstance(content, str) else content
        elements = self._extract_elements(content_bytes)
        
        md_lines = []
        for el in elements:
            el_type = el.get("type", "paragraph")
            text = el.get("text", "").strip()
            if not text:
                continue

            if el_type == "heading":
                if not text.startswith("#"):
                    md_lines.append(f"# {text}")
                else:
                    md_lines.append(text)
            elif el_type == "table":
                md_lines.append(text)
            else:
                # Format standard legal prefixes
                if text.upper().startswith("CHƯƠNG") or text.upper().startswith("MỤC"):
                    md_lines.append(f"# {text}")
                elif text.startswith("Điều ") or text.startswith("ĐIỀU "):
                    md_lines.append(f"## {text}")
                else:
                    md_lines.append(text)

        return "\n\n".join(md_lines)

    def _extract_elements(self, content_bytes: bytes) -> List[Dict[str, Any]]:
        try:
            import docx
            doc = docx.Document(io.BytesIO(content_bytes))
            elements = []
            for p in doc.paragraphs:
                if p.text.strip():
                    style_name = p.style.name.lower() if p.style else ""
                    if "heading" in style_name or "tiêu đề" in style_name:
                        elements.append({"type": "heading", "text": p.text.strip()})
                    else:
                        elements.append({"type": "paragraph", "text": p.text.strip()})
            return elements
        except Exception:
            # Fallback when python-docx is not available or mock is used
            raw_text = content_bytes.decode("utf-8", errors="ignore")
            lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
            return [{"type": "paragraph", "text": line} for line in lines]
