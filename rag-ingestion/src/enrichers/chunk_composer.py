"""Enriches legal AST nodes with breadcrumbs, fine ranges, vehicle tags, and cross-linked penalties."""

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.parsers.legal_ast import LegalASTNode


@dataclass
class EnrichedChunk:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    doc_code: str = ""
    doc_title: str = ""
    chapter_number: str = ""
    article_number: Optional[int] = None
    clause_number: Optional[int] = None
    point_code: Optional[str] = None
    breadcrumb: str = ""
    enriched_text: str = ""
    raw_content: str = ""
    fine_min_vnd: Optional[int] = None
    fine_max_vnd: Optional[int] = None
    vehicle_types: List[str] = field(default_factory=list)
    has_license_suspension: bool = False
    suspension_months_min: Optional[int] = None
    suspension_months_max: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class LegalChunkComposer:
    """Composes self-contained contextual chunks from hierarchical legal nodes."""

    # Vehicle keyword mappings
    VEHICLE_PATTERNS = {
        "motorbike": [
            r"xe mô tô", r"xe gắn máy", r"xe máy", r"mô tô", r"xe máy điện",
            r"xe hai bánh", r"người điều khiển xe mô tô"
        ],
        "car": [
            r"xe ô tô", r"ô tô", r"xe con", r"xe du lịch", r"xe taxi",
            r"người điều khiển xe ô tô"
        ],
        "truck": [
            r"xe tải", r"xe kéo", r"xe sơ mi rơ moóc", r"ô tô tải"
        ],
        "bus": [
            r"xe buýt", r"xe buyt", r"xe khách", r"ô tô chở người"
        ],
        "bicycle": [
            r"xe đạp", r"xe thô sơ", r"xe súc vật kéo", r"xe đạp điện"
        ],
        "pedestrian": [
            r"người đi bộ", r"người dẫn dắt súc vật"
        ],
    }

    # License suspension regex
    RE_SUSPENSION = re.compile(
        r"tước quyền sử dụng Giấy phép lái xe\s*(?:có thời hạn\s*)?từ\s*0?([0-9]+)\s*(?:tháng)?\s*đến\s*0?([0-9]+)\s*tháng",
        re.IGNORECASE,
    )
    RE_TARGET_REF = re.compile(
        r"điểm\s+([a-zđĐ](?:,\s*[a-zđĐ])*)\s+khoản\s+([0-9]+)",
        re.IGNORECASE,
    )

    def extract_fine_range(self, text: str) -> Tuple[Optional[int], Optional[int]]:
        """Extracts minimum and maximum fine amount in VND from legal clause text."""
        # 1. Million VND format: "từ 30 triệu đồng đến 40 triệu đồng" or "từ 30 đến 40 triệu đồng"
        m_trieu = re.search(
            r"từ\s+([0-9]+(?:\.[0-9]+)?)\s*(?:triệu)?\s*(?:đồng)?\s*đến\s*([0-9]+(?:\.[0-9]+)?)\s*triệu\s*đồng",
            text,
            re.IGNORECASE,
        )
        if m_trieu:
            min_val = int(float(m_trieu.group(1).replace(".", "")) * 1_000_000)
            max_val = int(float(m_trieu.group(2).replace(".", "")) * 1_000_000)
            return min_val, max_val

        # 2. Number dot format: "từ 400.000 đồng đến 600.000 đồng" or "từ 2.000.000 đến 3.000.000 đồng"
        m_dot = re.search(
            r"từ\s+([0-9]{1,3}(?:\.[0-9]{3})+)\s*(?:đồng)?\s*đến\s*([0-9]{1,3}(?:\.[0-9]{3})+)\s*đồng",
            text,
            re.IGNORECASE,
        )
        if m_dot:
            min_str = m_dot.group(1).replace(".", "")
            max_str = m_dot.group(2).replace(".", "")
            return int(min_str), int(max_str)

        return None, None

    def detect_vehicles(self, article_title: str, clause_text: str, point_text: str) -> List[str]:
        combined = f"{article_title} {clause_text} {point_text}".lower()
        vehicles = []
        for v_type, patterns in self.VEHICLE_PATTERNS.items():
            for pat in patterns:
                if re.search(pat, combined, re.IGNORECASE):
                    if v_type not in vehicles:
                        vehicles.append(v_type)
                    break
        return vehicles or ["general"]

    def _extract_supplementary_rules(self, nodes: List[LegalASTNode]) -> Dict[Tuple[int, int, str], Dict[str, Any]]:
        """Maps (article_number, clause_number, point_code) -> penalty info from supplementary clauses."""
        rules: Dict[Tuple[int, int, str], Dict[str, Any]] = {}
        for node in nodes:
            combined_text = f"{node.clause_text} {node.point_text} {node.raw_content}"
            if "bổ sung" in node.clause_text.lower() or "tước quyền sử dụng" in combined_text.lower():
                susp_match = self.RE_SUSPENSION.search(combined_text)
                if susp_match:
                    s_min = int(susp_match.group(1))
                    s_max = int(susp_match.group(2))
                    
                    # Find referenced points and clauses
                    for ref_match in self.RE_TARGET_REF.finditer(combined_text):
                        raw_points = ref_match.group(1)
                        target_clause = int(ref_match.group(2))
                        point_letters = [p.strip().lower() for p in raw_points.split(",") if p.strip()]
                        for p_code in point_letters:
                            art_num = node.article_number or 0
                            rules[(art_num, target_clause, p_code)] = {
                                "has_license_suspension": True,
                                "suspension_months_min": s_min,
                                "suspension_months_max": s_max,
                                "penalty_text": f"Tước GPLX từ {s_min:02d} đến {s_max:02d} tháng",
                            }
        return rules

    def compose_chunks(self, nodes: List[LegalASTNode]) -> List[EnrichedChunk]:
        supplementary_map = self._extract_supplementary_rules(nodes)
        enriched_chunks: List[EnrichedChunk] = []

        for node in nodes:
            # Skip pure supplementary rule listing nodes if they have no specific violation behavior of their own
            is_supp_clause = "bổ sung" in node.clause_text.lower() and "phạt tiền" not in node.clause_text.lower()
            
            fine_min, fine_max = self.extract_fine_range(node.clause_text)
            vehicle_types = self.detect_vehicles(node.article_title, node.clause_text, node.point_text)

            # Check for cross-linked supplementary penalty
            art_num = node.article_number or 0
            c_num = node.clause_number or 0
            p_code = (node.point_code or "").lower()
            supp_info = supplementary_map.get((art_num, c_num, p_code), {})

            has_susp = supp_info.get("has_license_suspension", False)
            s_min = supp_info.get("suspension_months_min")
            s_max = supp_info.get("suspension_months_max")
            penalty_summary = supp_info.get("penalty_text", "")

            # Compose breadcrumb
            parts = [node.doc_title or node.doc_code]
            if node.chapter_number:
                parts.append(f"Chương {node.chapter_number}")
            if node.article_number:
                parts.append(f"Điều {node.article_number}")
            if node.clause_number:
                parts.append(f"Khoản {node.clause_number}")
            if node.point_code:
                parts.append(f"Điểm {node.point_code}")

            breadcrumb = " > ".join(parts)

            # Compose Enriched Text
            fine_str = (
                f"{fine_min:,.0f}đ - {fine_max:,.0f}đ".replace(",", ".")
                if (fine_min and fine_max)
                else "Theo quy định"
            )
            
            text_lines = [
                f"[{breadcrumb}]",
                f"• Điều {node.article_number}: {node.article_title}",
                f"• Mức phạt tiền: {fine_str}",
            ]
            if penalty_summary:
                text_lines.append(f"• Hình phạt bổ sung: {penalty_summary}")
            if node.clause_text and not is_supp_clause:
                text_lines.append(f"• Quy định khoản: {node.clause_text}")
            if node.point_text:
                text_lines.append(f"• Hành vi vi phạm: Điểm {node.point_code}) {node.point_text}")
            elif node.raw_content:
                text_lines.append(f"• Nội dung: {node.raw_content}")

            enriched_text = "\n".join(text_lines)

            chunk = EnrichedChunk(
                id=str(uuid.uuid4()),
                doc_code=node.doc_code,
                doc_title=node.doc_title,
                chapter_number=node.chapter_number,
                article_number=node.article_number,
                clause_number=node.clause_number,
                point_code=node.point_code,
                breadcrumb=breadcrumb,
                enriched_text=enriched_text,
                raw_content=node.raw_content or node.point_text or node.clause_text,
                fine_min_vnd=fine_min,
                fine_max_vnd=fine_max,
                vehicle_types=vehicle_types,
                has_license_suspension=has_susp,
                suspension_months_min=s_min,
                suspension_months_max=s_max,
                metadata={
                    "doc_code": node.doc_code,
                    "article_number": node.article_number,
                    "clause_number": node.clause_number,
                    "point_code": node.point_code,
                    "fine_min": fine_min,
                    "fine_max": fine_max,
                    "vehicle_types": vehicle_types,
                    "has_suspension": has_susp,
                    "suspension_min": s_min,
                    "suspension_max": s_max,
                },
            )
            enriched_chunks.append(chunk)

        return enriched_chunks
