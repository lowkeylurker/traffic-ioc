"""Enriches legal AST nodes with breadcrumbs, fine ranges, vehicle tags, and cross-linked penalties.

Transforms AST nodes into self-contained semantic chunk units by:
1. Extracting explicit minimum and maximum fine amounts in VND from parent clauses.
2. Tagging vehicle classifications (motorbike, car, truck, bus, bicycle, pedestrian).
3. Cross-linking supplementary penalties (license suspension duration) from subsequent clauses.
4. Constructing clear breadcrumb path headers (`Nghị định > Chương > Điều > Khoản > Điểm`).
"""

import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from src.parsers.legal_ast import LegalASTNode


@dataclass
class EnrichedChunk:
    """Enriched, self-contained semantic chunk ready for embedding and Qdrant storage.

    Attributes:
        id (str): Chunk primary key UUID.
        doc_code (str): Legal document code (e.g. "100/2019/ND-CP").
        doc_title (str): Title of the decree or circular.
        chapter_number (str): Chapter Roman numeral identifier.
        article_number (Optional[int]): Article number.
        clause_number (Optional[int]): Clause number.
        point_code (Optional[str]): Sub-clause point letter.
        breadcrumb (str): Human-readable hierarchical navigation breadcrumb.
        enriched_text (str): Complete context-rich text string sent to the embedding model.
        raw_content (str): Verbatim text excerpt.
        fine_min_vnd (Optional[int]): Minimum fine amount in VND.
        fine_max_vnd (Optional[int]): Maximum fine amount in VND.
        vehicle_types (List[str]): Extracted target vehicle category keywords.
        has_license_suspension (bool): True if accompanied by driver license revocation.
        suspension_months_min (Optional[int]): Minimum license suspension period in months.
        suspension_months_max (Optional[int]): Maximum license suspension period in months.
        metadata (Dict[str, Any]): Complete payload dictionary indexed in Qdrant.
    """

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

    # Vehicle keyword mappings for semantic tagging and pre-filtering in vector database
    VEHICLE_PATTERNS = {
        "motorbike": [
            r"xe mô tô",
            r"xe gắn máy",
            r"xe máy",
            r"mô tô",
            r"xe máy điện",
            r"xe hai bánh",
            r"người điều khiển xe mô tô",
        ],
        "car": [
            r"xe ô tô",
            r"ô tô",
            r"xe con",
            r"xe du lịch",
            r"xe taxi",
            r"người điều khiển xe ô tô",
        ],
        "truck": [r"xe tải", r"xe kéo", r"xe sơ mi rơ moóc", r"ô tô tải"],
        "bus": [r"xe buýt", r"xe buyt", r"xe khách", r"ô tô chở người"],
        "bicycle": [r"xe đạp", r"xe thô sơ", r"xe súc vật kéo", r"xe đạp điện"],
        "pedestrian": [r"người đi bộ", r"người dẫn dắt súc vật"],
    }

    # Matches license suspension durations: "tước quyền sử dụng Giấy phép lái xe từ 01 tháng đến 03 tháng"
    RE_SUSPENSION = re.compile(
        r"tước quyền sử dụng Giấy phép lái xe\s*(?:có thời hạn\s*)?từ\s*0?([0-9]+)\s*(?:tháng)?\s*đến\s*0?([0-9]+)\s*tháng",
        re.IGNORECASE,
    )
    # Matches cross-references to points and clauses: "thực hiện hành vi quy định tại điểm a, điểm b khoản 2 Điều này"
    RE_TARGET_REF = re.compile(
        r"điểm\s+([a-zđĐ](?:,\s*[a-zđĐ])*)\s+khoản\s+([0-9]+)",
        re.IGNORECASE,
    )

    def extract_fine_range(self, text: str) -> Tuple[Optional[int], Optional[int]]:
        """Extract minimum and maximum fine amounts in VND from legal clause text.

        Handles both standard numeric patterns ('400.000 đồng đến 600.000 đồng')
        and text scale units ('từ 30 triệu đồng đến 40 triệu đồng').

        Args:
            text (str): Clause or provision text.

        Returns:
            Tuple[Optional[int], Optional[int]]: (fine_min_vnd, fine_max_vnd) in Vietnamese Dong.
        """
        # Case 1: Million unit scale (e.g. "từ 30 triệu đồng đến 40 triệu đồng" or "từ 30 đến 40 triệu đồng")
        m_trieu = re.search(
            r"từ\s+([0-9]+(?:\.[0-9]+)?)\s*(?:triệu)?\s*(?:đồng)?\s*đến\s*([0-9]+(?:\.[0-9]+)?)\s*triệu\s*đồng",
            text,
            re.IGNORECASE,
        )
        if m_trieu:
            # Convert decimal string to integer VND (e.g., 30 -> 30,000,000)
            min_val = int(float(m_trieu.group(1).replace(".", "")) * 1_000_000)
            max_val = int(float(m_trieu.group(2).replace(".", "")) * 1_000_000)
            return min_val, max_val

        # Case 2: Dot-formatted thousands digits (e.g. "từ 400.000 đồng đến 600.000 đồng")
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
        """Classify target vehicle types from combined article, clause, and point text.

        Scans text against curated Vietnamese transport keyword regexes.

        Args:
            article_title (str): Title of the article.
            clause_text (str): Body of the clause.
            point_text (str): Body of the specific violation point.

        Returns:
            List[str]: List of matched vehicle type tokens ("motorbike", "car", etc.).
        """
        combined = f"{article_title} {clause_text} {point_text}".lower()
        vehicles = []
        for v_type, patterns in self.VEHICLE_PATTERNS.items():
            for pat in patterns:
                if re.search(pat, combined, re.IGNORECASE):
                    if v_type not in vehicles:
                        vehicles.append(v_type)
                    break
        # Fallback to "general" if no specific vehicle keywords were mentioned
        return vehicles or ["general"]

    def _extract_supplementary_rules(
        self, nodes: List[LegalASTNode]
    ) -> Dict[Tuple[int, int, str], Dict[str, Any]]:
        """Map (article_number, clause_number, point_code) tuples to supplementary penalties.

        Vietnamese decrees place additional penalties (hình phạt bổ sung) like license suspensions
        at the end of an article (e.g. Khoản 10 Điều 6), referencing earlier violation clauses.
        This pre-pass resolves those references so that each violation chunk includes its full penalty.

        Args:
            nodes (List[LegalASTNode]): Full list of AST nodes across the decree.

        Returns:
            Dict[Tuple[int, int, str], Dict[str, Any]]: Dictionary mapping target provisions
                to license suspension metadata.
        """
        rules: Dict[Tuple[int, int, str], Dict[str, Any]] = {}
        for node in nodes:
            combined_text = f"{node.clause_text} {node.point_text} {node.raw_content}"
            # Check if this node represents a supplementary penalty clause
            if (
                "bổ sung" in node.clause_text.lower()
                or "tước quyền sử dụng" in combined_text.lower()
            ):
                susp_match = self.RE_SUSPENSION.search(combined_text)
                if susp_match:
                    s_min = int(susp_match.group(1))
                    s_max = int(susp_match.group(2))

                    # Find all cross-referenced violation points (e.g. "điểm a, điểm b khoản 2")
                    for ref_match in self.RE_TARGET_REF.finditer(combined_text):
                        raw_points = ref_match.group(1)
                        target_clause = int(ref_match.group(2))
                        point_letters = [
                            p.strip().lower() for p in raw_points.split(",") if p.strip()
                        ]
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
        """Enrich a list of AST nodes with contextual breadcrumbs, fine limits, and cross-linked penalties.

        Constructs high-density semantic text chunks specifically formatted for embedding models:
        - Injects breadcrumbs: `[Nghị định 100/2019/NĐ-CP > Chương II > Điều 6 > Khoản 2 > Điểm b]`
        - Includes formatted fine amounts in VND.
        - Appends cross-linked license suspension penalties.
        - Provides verbatim violation behavior for legal precision.

        Args:
            nodes (List[LegalASTNode]): Parsed AST nodes.

        Returns:
            List[EnrichedChunk]: Complete list of enriched semantic chunks.
        """
        # Step 1: Pre-index all supplementary penalty cross-references
        supplementary_map = self._extract_supplementary_rules(nodes)
        enriched_chunks: List[EnrichedChunk] = []

        for node in nodes:
            is_supp_clause = (
                "bổ sung" in node.clause_text.lower()
                and "phạt tiền" not in node.clause_text.lower()
            )

            # Step 2: Extract monetary fine range and vehicle taxonomy
            fine_min, fine_max = self.extract_fine_range(node.clause_text)
            vehicle_types = self.detect_vehicles(
                node.article_title, node.clause_text, node.point_text
            )

            # Step 3: Check for cross-linked license suspension penalty
            art_num = node.article_number or 0
            c_num = node.clause_number or 0
            p_code = (node.point_code or "").lower()
            supp_info = supplementary_map.get((art_num, c_num, p_code), {})

            has_susp = supp_info.get("has_license_suspension", False)
            s_min = supp_info.get("suspension_months_min")
            s_max = supp_info.get("suspension_months_max")
            penalty_summary = supp_info.get("penalty_text", "")

            # Step 4: Construct unambiguous hierarchical breadcrumb
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

            # Step 5: Format human-readable fine string (e.g. 400.000đ - 600.000đ)
            fine_str = (
                f"{fine_min:,.0f}đ - {fine_max:,.0f}đ".replace(",", ".")
                if (fine_min and fine_max)
                else "Theo quy định"
            )

            # Step 6: Compose structured enriched chunk text
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

            # Step 7: Build EnrichedChunk record with indexed metadata
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
