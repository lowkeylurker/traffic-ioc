"""Unit tests for FastAPI ingestion API endpoints."""

import unittest
from unittest.mock import MagicMock, patch

from src.api.routes.ingest import IngestionPipeline, IngestionRequest, IngestionResponse


class TestIngestionPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = IngestionPipeline()

    def test_process_markdown_payload(self):
        sample_md = """
# CHƯƠNG II: HÀNH VI VI PHẠM
## Điều 6. Xử phạt xe mô tô
1. Phạt tiền từ 100.000 đồng đến 200.000 đồng:
- Điểm a) Không chấp hành hiệu lệnh biển báo.
2. Phạt tiền từ 400.000 đồng đến 600.000 đồng:
- Điểm b) Vượt đèn đỏ.
        """
        request = IngestionRequest(
            kb_code="vietnam_traffic_legislation",
            doc_code="ND-100-2019",
            doc_title="Nghị định 100/2019/NĐ-CP",
            content_text=sample_md,
            filename="nd100.md",
        )

        with patch.object(self.pipeline.embedder, "embed_documents", return_value=[[0.1] * 1024, [0.2] * 1024]):
            with patch.object(self.pipeline.qdrant_sync, "upsert_chunks", return_value=2):
                with patch.object(self.pipeline.oltp_sync, "sync_document_and_chunks", return_value={"synced_chunks": 2}):
                    response = self.pipeline.process_ingestion(request)

                    self.assertEqual(response.status, "success")
                    self.assertEqual(response.doc_code, "ND-100-2019")
                    self.assertEqual(response.chunks_count, 2)
                    self.assertEqual(response.points_upserted, 2)

    def test_health_check(self):
        from src.main import get_health
        health = get_health()
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["service"], "rag-ingestion")


if __name__ == "__main__":
    unittest.main()
