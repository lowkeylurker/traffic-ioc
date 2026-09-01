"""Unit tests for EmbedderFactory, OpenAIEmbedder, OltpSyncService, and QdrantSyncService."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from src.enrichers.chunk_composer import EnrichedChunk
from src.services.embedder import (
    BaseEmbedder,
    EmbedderFactory,
    OpenAIEmbedder,
    get_embedder,
)
from src.services.oltp_sync import OltpSyncService
from src.services.qdrant_sync import QdrantSyncService


class TestEmbedderFactory(unittest.TestCase):
    def test_factory_creates_openai_embedder(self):
        embedder = EmbedderFactory.create(
            provider="openai",
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            model_name="bge-m3",
            vector_dim=1024,
        )
        self.assertIsInstance(embedder, BaseEmbedder)
        self.assertIsInstance(embedder, OpenAIEmbedder)
        self.assertEqual(embedder.vector_dim, 1024)

    def test_factory_unknown_provider_raises_error(self):
        with self.assertRaises(ValueError):
            EmbedderFactory.create(provider="unsupported_provider")

    def test_get_embedder_helper(self):
        embedder = get_embedder()
        self.assertIsInstance(embedder, BaseEmbedder)


class TestOpenAIEmbedder(unittest.TestCase):
    def setUp(self):
        self.embedder = OpenAIEmbedder(
            base_url="http://localhost:11434/v1", api_key="ollama", model_name="bge-m3"
        )

    def test_embed_single_text(self):
        mock_client = MagicMock()
        mock_item = MagicMock()
        mock_item.embedding = [0.1, 0.2, 0.3]
        mock_response = MagicMock()
        mock_response.data = [mock_item]
        mock_client.embeddings.create.return_value = mock_response

        self.embedder._client = mock_client
        vector = self.embedder.embed_query("Vượt đèn đỏ xe máy phạt bao nhiêu?")
        self.assertEqual(len(vector), 3)
        self.assertEqual(vector[0], 0.1)
        mock_client.embeddings.create.assert_called_once_with(
            model="bge-m3",
            input=["Vượt đèn đỏ xe máy phạt bao nhiêu?"],
        )

    def test_embed_batch_documents(self):
        mock_client = MagicMock()
        mock_item1 = MagicMock()
        mock_item1.embedding = [0.05, 0.15, 0.25]
        mock_item2 = MagicMock()
        mock_item2.embedding = [0.10, 0.20, 0.30]
        mock_response = MagicMock()
        mock_response.data = [mock_item1, mock_item2]
        mock_client.embeddings.create.return_value = mock_response

        self.embedder._client = mock_client
        texts = ["Hành vi 1", "Hành vi 2"]
        vectors = self.embedder.embed_documents(texts)
        self.assertEqual(len(vectors), 2)
        self.assertEqual(vectors[0], [0.05, 0.15, 0.25])
        self.assertEqual(vectors[1], [0.10, 0.20, 0.30])


class TestQdrantSyncService(unittest.TestCase):
    def setUp(self):
        self.qdrant_service = QdrantSyncService(host="localhost", port=6333)

    def test_ensure_collection_and_upsert_points(self):
        mock_client = MagicMock()
        mock_client.collection_exists.return_value = True
        self.qdrant_service.client = mock_client

        chunk = EnrichedChunk(
            id="00000000-0000-0000-0000-000000000001",
            doc_code="ND-100-2019",
            doc_title="Nghị định 100/2019/NĐ-CP",
            article_number=6,
            clause_number=2,
            point_code="b",
            breadcrumb="NĐ 100 > Điều 6 > Khoản 2 > Điểm b",
            enriched_text="Vượt đèn đỏ phạt 400.000đ - 600.000đ",
            fine_min_vnd=400000,
            fine_max_vnd=600000,
            vehicle_types=["motorbike"],
        )
        embeddings = [[0.1] * 1024]

        count = self.qdrant_service.upsert_chunks(
            collection_name="vietnam_traffic_laws",
            chunks=[chunk],
            embeddings=embeddings,
        )
        self.assertEqual(count, 1)
        mock_client.upsert.assert_called_once()


class TestOltpSyncService(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.oltp_service = OltpSyncService(
            db_url="postgresql+asyncpg://traffic_user:traffic_password@localhost:5434/traffic_ioc_oltp"
        )

    async def test_sync_document_and_chunks(self):
        chunk = EnrichedChunk(
            id="00000000-0000-0000-0000-000000000002",
            doc_code="ND-100-2019",
            doc_title="Nghị định 100/2019/NĐ-CP",
            article_number=6,
            clause_number=2,
            point_code="b",
            breadcrumb="NĐ 100 > Điều 6 > Khoản 2 > Điểm b",
            enriched_text="Vượt đèn đỏ",
            fine_min_vnd=400000,
            fine_max_vnd=600000,
            vehicle_types=["motorbike"],
        )

        with patch.object(
            self.oltp_service,
            "_execute_sync",
            new_callable=AsyncMock,
            return_value={"kb_id": "kb-1", "doc_id": "doc-1", "synced_chunks": 1},
        ):
            res = await self.oltp_service.sync_document_and_chunks(
                kb_code="vietnam_traffic_legislation",
                kb_name="Cơ sở dữ liệu Pháp luật Giao thông Việt Nam",
                doc_code="ND-100-2019",
                doc_title="Nghị định 100/2019/NĐ-CP",
                chunks=[chunk],
            )
            self.assertEqual(res["synced_chunks"], 1)
            self.assertEqual(res["doc_id"], "doc-1")


if __name__ == "__main__":
    unittest.main()
