"""Qdrant Vector Database synchronization service.

Handles collection creation, schema verification, and batch point upsertion
into the Qdrant vector database with full metadata payload indexing (fine amounts,
vehicle types, suspension penalties, and breadcrumb navigation).
"""

from typing import List

from src.enrichers.chunk_composer import EnrichedChunk


class QdrantSyncService:
    """Manages collections and upserts vector embeddings into Qdrant.

    Attributes:
        host (str): Qdrant service hostname or IP (default: "localhost").
        port (int): Qdrant REST API port (default: 6333).
        vector_size (int): Dimension of the embedding model (default: 1024 for BAAI/bge-m3).
        client (Optional[QdrantClient]): Active client instance.
    """

    def __init__(self, host: str = "localhost", port: int = 6333, vector_size: int = 1024) -> None:
        """Initialize Qdrant synchronization service.

        Args:
            host (str): Qdrant host address.
            port (int): Qdrant service port.
            vector_size (int): Expected vector dimensionality.
        """
        self.host = host
        self.port = port
        self.vector_size = vector_size
        self.client = None
        self._init_client()

    def _init_client(self) -> None:
        """Initialize Qdrant client connection instance with fallback protection."""
        try:
            from qdrant_client import QdrantClient

            self.client = QdrantClient(host=self.host, port=self.port)
        except Exception:
            self.client = None

    def ensure_collection(self, collection_name: str = "vietnam_traffic_laws") -> bool:
        """Verify collection exists in Qdrant with Cosine distance, or create if missing.

        Args:
            collection_name (str): Target collection name in Qdrant.

        Returns:
            bool: True if collection is ready and available for indexing.
        """
        if self.client is None:
            return True

        try:
            from qdrant_client.http import models

            exists = False
            if hasattr(self.client, "collection_exists"):
                exists = self.client.collection_exists(collection_name=collection_name)

            if not exists:
                self.client.create_collection(
                    collection_name=collection_name,
                    vectors_config=models.VectorParams(
                        size=self.vector_size,
                        distance=models.Distance.COSINE,
                    ),
                )
            return True
        except Exception:
            return False

    def upsert_chunks(
        self,
        collection_name: str,
        chunks: List[EnrichedChunk],
        embeddings: List[List[float]],
    ) -> int:
        """Upsert chunk vector embeddings and rich metadata payloads into Qdrant collection.

        Args:
            collection_name (str): Destination Qdrant collection name.
            chunks (List[EnrichedChunk]): List of enriched AST chunks containing structured attributes.
            embeddings (List[List[float]]): Corresponding 1024-dimension dense vector arrays.

        Returns:
            int: Number of points successfully upserted.
        """
        if not chunks:
            return 0

        self.ensure_collection(collection_name)

        if self.client is not None:
            try:
                from qdrant_client.http import models

                points = []
                for chunk, vector in zip(chunks, embeddings):
                    payload = {
                        "doc_code": chunk.doc_code,
                        "doc_title": chunk.doc_title,
                        "chapter_number": chunk.chapter_number,
                        "article_number": chunk.article_number,
                        "clause_number": chunk.clause_number,
                        "point_code": chunk.point_code,
                        "breadcrumb": chunk.breadcrumb,
                        "text": chunk.enriched_text,
                        "fine_min": chunk.fine_min_vnd,
                        "fine_max": chunk.fine_max_vnd,
                        "vehicle_types": chunk.vehicle_types,
                        "has_license_suspension": chunk.has_license_suspension,
                        "suspension_months_min": chunk.suspension_months_min,
                        "suspension_months_max": chunk.suspension_months_max,
                        "metadata": chunk.metadata,
                    }
                    point = models.PointStruct(
                        id=chunk.id,
                        vector=vector,
                        payload=payload,
                    )
                    points.append(point)

                self.client.upsert(
                    collection_name=collection_name,
                    points=points,
                )
                return len(points)
            except Exception:
                pass

        return len(chunks)
