"""Unit tests for FastAPI ingestion API endpoints and Celery task execution."""

import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.main import app
from src.schemas.ingest import IngestionRequest
from src.services.ingestion_pipeline import IngestionPipeline
from src.tasks.ingestion_tasks import process_document_ingestion_task


class TestIngestionPipeline(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.pipeline = IngestionPipeline()

    async def test_process_markdown_payload_async(self):
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

        with patch.object(
            self.pipeline.embedder, "embed_documents", return_value=[[0.1] * 1024, [0.2] * 1024]
        ):
            with patch.object(self.pipeline.qdrant_sync, "upsert_chunks", return_value=2):
                with patch.object(
                    self.pipeline.oltp_sync,
                    "sync_document_and_chunks",
                    return_value={"synced_chunks": 2},
                ):
                    with patch(
                        "src.services.ingestion_pipeline.redis_publisher.publish_event",
                        new_callable=AsyncMock,
                    ) as mock_pub:
                        await self.pipeline.process_ingestion_async(request, "job-test-123")

                        self.assertTrue(mock_pub.called)
                        event_names = [call[0][2] for call in mock_pub.call_args_list]
                        self.assertIn("progress", event_names)
                        self.assertIn("complete", event_names)

    async def test_process_minio_storage_key_async(self):
        sample_md_bytes = b"# CHUONG I\n## Dieu 1. Quy dinh\n1. Xu phat."
        request = IngestionRequest(
            doc_id="doc-uuid-1",
            storage_key="laws/ND100/nd100.md",
            doc_code="ND-100",
            doc_title="ND 100",
            filename="nd100.md",
        )

        with patch.object(
            self.pipeline.minio_storage, "download_file_bytes", return_value=sample_md_bytes
        ):
            with patch.object(
                self.pipeline.embedder, "embed_documents", return_value=[[0.1] * 1024]
            ):
                with patch.object(self.pipeline.qdrant_sync, "upsert_chunks", return_value=1):
                    with patch.object(
                        self.pipeline.oltp_sync,
                        "sync_document_and_chunks",
                        return_value={"synced_chunks": 1},
                    ):
                        with patch(
                            "src.services.ingestion_pipeline.redis_publisher.publish_event",
                            new_callable=AsyncMock,
                        ) as mock_pub:
                            await self.pipeline.process_ingestion_async(request, "job-minio-123")

                            self.assertTrue(mock_pub.called)
                            event_names = [call[0][2] for call in mock_pub.call_args_list]
                            self.assertIn("progress", event_names)
                            self.assertIn("complete", event_names)

    def test_health_check(self):
        from src.main import get_health

        health = get_health()
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["service"], "rag-ingestion")


class TestCeleryIngestionRoutes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("src.api.routes.ingest.process_document_ingestion_task.apply_async")
    def test_enqueue_process_async_endpoint(self, mock_apply_async):
        payload = {
            "kb_code": "vietnam_traffic_laws",
            "doc_code": "ND-100-2019",
            "doc_title": "Nghị định 100/2019/NĐ-CP",
            "content_text": "# CHƯƠNG I\nĐiều 1. Quy định chung",
        }
        response = self.client.post("/api/v1/ingest/traffic-law/process-async", json=payload)
        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data["status"], "accepted")
        self.assertEqual(data["docCode"], "ND-100-2019")
        self.assertTrue(data["jobId"].startswith("job-"))
        mock_apply_async.assert_called_once()

    @patch("src.api.routes.ingest.process_document_ingestion_task.apply_async")
    def test_enqueue_retry_endpoint(self, mock_apply_async):
        payload = {
            "doc_code": "ND-123-2021",
            "doc_title": "Nghị định 123/2021/NĐ-CP",
            "storage_key": "laws/ND123/nd123.pdf",
        }
        response = self.client.post("/api/v1/ingest/traffic-law/retry", json=payload)
        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data["status"], "accepted")
        self.assertEqual(data["docCode"], "ND-123-2021")
        mock_apply_async.assert_called_once()

    @patch(
        "src.tasks.ingestion_tasks.ingestion_pipeline.process_ingestion_async",
        new_callable=AsyncMock,
    )
    def test_celery_task_execution(self, mock_pipeline):
        req_dict = {
            "doc_code": "ND-100-2019",
            "doc_title": "Nghị định 100/2019/NĐ-CP",
            "content_text": "Sample law content",
        }
        res = process_document_ingestion_task.apply(args=[req_dict, "job-celery-123"]).get()
        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["job_id"], "job-celery-123")
        self.assertEqual(res["doc_code"], "ND-100-2019")
        mock_pipeline.assert_called_once()


if __name__ == "__main__":
    unittest.main()
