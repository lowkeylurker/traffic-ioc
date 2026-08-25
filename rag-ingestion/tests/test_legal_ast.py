"""Unit tests for hierarchical legal AST parser."""

import unittest
from src.parsers.legal_ast import LegalASTNode, LegalNodeParser, LegalNodeType

SAMPLE_LEGAL_MARKDOWN = """
# CHƯƠNG II: HÀNH VI VI PHẠM, HÌNH THỨC, MỨC XỬ PHẠT

## Mục 1: VI PHẠM QUY TẮC GIAO THÔNG ĐƯỜNG BỘ

## Điều 6. Xử phạt người điều khiển xe mô tô, xe gắn máy (kể cả xe máy điện), các loại xe tương tự xe mô tô và các loại xe tương tự xe gắn máy vi phạm quy tắc giao thông đường bộ

1. Phạt tiền từ 100.000 đồng đến 200.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Không chấp hành hiệu lệnh, chỉ dẫn của biển báo hiệu, vạch kẻ đường;
- Điểm b) Chuyển hướng không nhường đường cho các xe đi ngược chiều.

2. Phạt tiền từ 400.000 đồng đến 600.000 đồng đối với người điều khiển xe thực hiện một trong các hành vi vi phạm sau đây:
- Điểm a) Chuyển hướng không giảm tốc độ hoặc không có tín hiệu báo hướng rẽ;
- Điểm k) Không đội mũ bảo hiểm cho người đi mô tô, xe máy hoặc đội mũ bảo hiểm không cài quai đúng quy cách khi tham gia giao thông.

10. Ngoài việc bị phạt tiền, người điều khiển xe thực hiện hành vi vi phạm còn bị áp dụng các hình thức xử phạt bổ sung sau đây:
- Điểm a) Thực hiện hành vi quy định tại điểm k khoản 2 Điều này nếu gây tai nạn giao thông thì bị tước quyền sử dụng Giấy phép lái xe từ 01 tháng đến 03 tháng.
"""


class TestLegalASTParser(unittest.TestCase):
    def setUp(self):
        self.parser = LegalNodeParser(doc_code="ND-100-2019", doc_title="Nghị định 100/2019/NĐ-CP")

    def test_parse_hierarchy_tree(self):
        tree = self.parser.parse_to_tree(SAMPLE_LEGAL_MARKDOWN)
        self.assertIsNotNone(tree)
        self.assertEqual(len(tree.chapters), 1)
        chapter = tree.chapters[0]
        self.assertEqual(chapter.chapter_number, "II")
        self.assertIn("HÀNH VI VI PHẠM", chapter.title)

        self.assertEqual(len(chapter.articles), 1)
        article = chapter.articles[0]
        self.assertEqual(article.article_number, 6)
        self.assertIn("xe mô tô, xe gắn máy", article.title)

        self.assertEqual(len(article.clauses), 3)  # Khoản 1, Khoản 2, Khoản 10
        clause_2 = next(c for c in article.clauses if c.clause_number == 2)
        self.assertEqual(len(clause_2.points), 2)  # Điểm a, Điểm k

        point_k = next(p for p in clause_2.points if p.point_code == "k")
        self.assertIn("Không đội mũ bảo hiểm", point_k.text)

    def test_parse_to_leaf_nodes(self):
        nodes = self.parser.parse_to_nodes(SAMPLE_LEGAL_MARKDOWN)
        self.assertTrue(len(nodes) >= 4)  # Points from Clause 1, 2, 10
        
        point_k_nodes = [n for n in nodes if n.point_code == "k" and n.clause_number == 2]
        self.assertEqual(len(point_k_nodes), 1)
        node = point_k_nodes[0]
        self.assertEqual(node.doc_code, "ND-100-2019")
        self.assertEqual(node.article_number, 6)
        self.assertEqual(node.clause_number, 2)
        self.assertEqual(node.point_code, "k")


if __name__ == "__main__":
    unittest.main()
