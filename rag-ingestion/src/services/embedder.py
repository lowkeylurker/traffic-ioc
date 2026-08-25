"""Embedding service utilizing Ollama BAAI/bge-m3 dense vector model."""

import json
import urllib.request
from typing import List, Optional


class OllamaEmbedder:
    """Generates 1024-dimensional dense vectors using Ollama embedding endpoints."""

    def __init__(self, base_url: str = "http://localhost:11434", model_name: str = "bge-m3"):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.vector_dim = 1024

    def embed_query(self, text: str) -> List[float]:
        """Embeds a single query string."""
        vectors = self.embed_documents([text])
        return vectors[0] if vectors else [0.0] * self.vector_dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Batch embeds multiple texts into a list of vector floats."""
        results: List[List[float]] = []
        endpoint = f"{self.base_url}/api/embeddings"

        for text in texts:
            payload = {
                "model": self.model_name,
                "prompt": text,
            }
            try:
                req = urllib.request.Request(
                    endpoint,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    embedding = data.get("embedding", [])
                    if not embedding:
                        embedding = [0.0] * self.vector_dim
                    results.append(embedding)
            except Exception:
                # Fallback mock deterministic vector if Ollama is unreachable
                import hashlib
                h = hashlib.sha256(text.encode("utf-8")).digest()
                pseudo_vec = [(float(b) / 255.0) - 0.5 for b in (h * 32)[:self.vector_dim]]
                results.append(pseudo_vec)

        return results
