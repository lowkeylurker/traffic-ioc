"""Unit tests for chunk composer, breadcrumb enricher, and penalty cross-linker."""

import unittest
from src.enrichers.chunk_composer import EnrichedChunk, LegalChunkComposer
from src.parsers.legal_ast import LegalNodeParser

SAMPLE_DECREE_TEXT = """
# CHƯƠNG II: HÀNH VI VI PHẠM, HÌNH THỨC, MỨC XỬ PHẠT

## Điều 6. Xử phạt người điều khiển xe mô tô, xe gắn máy (kể cả xe máy điện), các loại xe tương tự xe mô tô vi phạm quy tắc giao thông đường bộ

1. Phạt tiền từ 100.000 đồng đến 200.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Không chấp hành hiệu lệnh, chỉ dẫn của biển báo hiệu, vạch kẻ đường;
- Điểm b) Chuyển hướng không nhường đường cho các xe đi ngược chiều.

2. Phạt tiền từ 400.000 đồng đến 600.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm b) Không chấp hành hiệu lệnh của đèn tín hiệu giao thông;
- Điểm k) Không đội mũ bảo hiểm cho người đi mô tô, xe máy hoặc đội mũ bảo hiểm không cài quai đúng quy cách khi tham gia giao thông trên đường bộ.

10. Ngoài việc bị phạt tiền, người điều khiển xe thực hiện hành vi vi phạm còn bị áp dụng các hình thức xử phạt bổ sung sau đây:
- Điểm b) Thực hiện hành vi quy định tại điểm b khoản 2 Điều này bị tước quyền sử dụng Giấy phép lái xe từ 01 tháng đến 03 tháng.
"""


class TestChunkComposer(unittest.TestCase):
    def setUp(self):
        self.parser = LegalNodeParser(doc_code="ND-100-2019", doc_title="Nghị định 100/2019/NĐ-CP")
        self.composer = LegalChunkComposer()

    def test_extract_fine_ranges_and_vehicles(self):
        nodes = self.parser.parse_to_nodes(SAMPLE_DECREE_TEXT)
        enriched_chunks = self.composer.compose_chunks(nodes)
        
        # Test Point 2b (Chạy vượt đèn đỏ)
        chunk_2b = next(c for c in enriched_chunks if c.clause_number == 2 and c.point_code == "b")
        self.assertEqual(chunk_2b.fine_min_vnd, 400000)
        self.assertEqual(chunk_2b.fine_max_vnd, 600000)
        self.assertIn("motorbike", chunk_2b.vehicle_types)
        self.assertIn("Nghị định 100/2019/NĐ-CP", chunk_2b.breadcrumb)
        self.assertIn("Điều 6", chunk_2b.breadcrumb)
        self.assertIn("Khoản 2", chunk_2b.breadcrumb)

    def test_supplementary_penalty_cross_linking(self):
        nodes = self.parser.parse_to_nodes(SAMPLE_DECREE_TEXT)
        enriched_chunks = self.composer.compose_chunks(nodes)

        chunk_2b = next(c for c in enriched_chunks if c.clause_number == 2 and c.point_code == "b")
        self.assertEqual(chunk_2b.suspension_months_min, 1)
        self.assertEqual(chunk_2b.suspension_months_max, 3)
        self.assertTrue(chunk_2b.has_license_suspension)
        self.assertIn("Tước GPLX từ 01 đến 03 tháng", chunk_2b.enriched_text)

    def test_fine_amount_regex_variants(self):
        test_cases = [
            ("Phạt tiền từ 2.000.000 đồng đến 3.000.000 đồng", 2000000, 3000000),
            ("Phạt tiền từ 400.000 đồng đến 600.000 đồng", 400000, 600000),
            ("Phạt tiền từ 10.000.000 đồng đến 12.000.000 đồng", 10000000, 12000000),
            ("Phạt tiền từ 100.000 đồng đến 200.000 đồng", 100000, 200000),
            ("Phạt tiền từ 30 triệu đồng đến 40 triệu đồng", 30000000, 40000000),
        ]
        for text, exp_min, exp_max in test_cases:
            f_min, f_max = self.composer.extract_fine_range(text)
            self.assertEqual(f_min, exp_min, f"Failed for {text}")
            self.assertEqual(f_max, exp_max, f"Failed for {text}")


if __name__ == "__main__":
    unittest.main()
