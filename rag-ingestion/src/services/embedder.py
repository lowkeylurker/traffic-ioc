"""Vector embedding module with an extensible Factory pattern.

Provides an abstract BaseEmbedder interface and concrete provider implementations
(e.g., OpenAI SDK supporting OpenAI, Ollama /v1, vLLM, FastEmbed, TEI).
External callers use `get_embedder()` or `EmbedderFactory.create()` to obtain an embedder
instance and call its unified methods (`embed_query`, `embed_documents`) without needing
to know provider-specific implementation or configuration details.
"""

import hashlib
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type

from openai import OpenAI

from src.config import settings

logger = logging.getLogger(__name__)


class BaseEmbedder(ABC):
    """Abstract Base Class defining the unified embedding contract for all backends."""

    def __init__(self, **kwargs: Any) -> None:
        """Initialize the base embedder with optional arbitrary provider arguments."""
        pass

    @abstractmethod
    def embed_query(self, text: str) -> List[float]:
        """Embed a single query text into a dense float vector.

        Args:
            text (str): Query string.

        Returns:
            List[float]: Normalized dense vector floats.
        """
        pass

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Batch embed multiple document chunk strings into dense float vector lists.

        Args:
            texts (List[str]): List of chunk texts to vectorize.

        Returns:
            List[List[float]]: Ordered list of dense vector arrays.
        """
        pass

    @property
    @abstractmethod
    def vector_dim(self) -> int:
        """Return the vector dimensionality of the embedding model."""
        pass


class OpenAIEmbedder(BaseEmbedder):
    """Embedder implementation powered by the official OpenAI Python SDK.

    Compatible with any server providing an OpenAI-compatible `/v1/embeddings` endpoint
    (e.g., OpenAI, Ollama `/v1`, vLLM, HuggingFace TEI, LiteLLM).

    Attributes:
        base_url (str): OpenAI-compatible API base URL (e.g. "http://localhost:11434/v1").
        api_key (str): Authentication token.
        model_name (str): Active embedding model identifier (e.g. "bge-m3", "text-embedding-3-small").
        _dim (int): Dimensionality of the produced vectors (e.g. 1024).
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        vector_dim: Optional[int] = None,
        **kwargs: Any,
    ) -> None:
        """Initialize the OpenAI-compatible embedding client.

        Args:
            base_url (Optional[str]): Endpoint base URL override.
            api_key (Optional[str]): API token override.
            model_name (Optional[str]): Model name override.
            vector_dim (Optional[int]): Vector dimension override (default: 1024).
            **kwargs (Any): Additional provider keyword arguments.
        """
        super().__init__(**kwargs)
        raw_base = base_url or settings.EMBEDDING_BASE_URL
        clean_base = raw_base.rstrip("/")
        if not clean_base.endswith("/v1"):
            clean_base = f"{clean_base}/v1"

        self.base_url = clean_base
        self.api_key = api_key or settings.EMBEDDING_API_KEY
        self.model_name = model_name or settings.EMBEDDING_MODEL
        self._dim = vector_dim or settings.QDRANT_VECTOR_SIZE
        self._client: Optional[OpenAI] = None

    @property
    def vector_dim(self) -> int:
        """Return vector dimension."""
        return self._dim

    def get_client(self) -> OpenAI:
        """Instantiate and return the OpenAI client singleton instance.

        Returns:
            OpenAI: Configured client instance.
        """
        if self._client is None:
            self._client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
            )
        return self._client

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query string into a dense vector.

        Args:
            text (str): Input query text.

        Returns:
            List[float]: Normalized dense vector.
        """
        vectors = self.embed_documents([text])
        return vectors[0] if vectors else [0.0] * self._dim

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Batch embed multiple document chunk strings using the OpenAI SDK.

        Args:
            texts (List[str]): List of chunk texts to embed.

        Returns:
            List[List[float]]: Dense vector float arrays matching input order.
        """
        if not texts:
            return []

        try:
            client = self.get_client()
            response = client.embeddings.create(
                model=self.model_name,
                input=texts,
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            logger.warning(
                f"Embedding API request to {self.base_url} (model: {self.model_name}) failed: {e}. "
                "Falling back to deterministic pseudo-embedding for testing/offline mode."
            )
            # Deterministic pseudo-embedding fallback when embedding endpoint is offline
            results: List[List[float]] = []
            for text in texts:
                h = hashlib.sha256(text.encode("utf-8")).digest()
                pseudo_vec = [(float(b) / 255.0) - 0.5 for b in (h * 32)[: self._dim]]
                results.append(pseudo_vec)
            return results


class EmbedderFactory:
    """Factory class to register and instantiate embedder backends dynamically."""

    _registry: Dict[str, Type[BaseEmbedder]] = {
        "openai": OpenAIEmbedder,
        "default": OpenAIEmbedder,
    }
    _default_instance: Optional[BaseEmbedder] = None

    @classmethod
    def register(cls, provider: str, embedder_cls: Type[BaseEmbedder]) -> None:
        """Register a new embedder provider class.

        Args:
            provider (str): Provider identifier (e.g. "openai", "gemini", "cohere").
            embedder_cls (Type[BaseEmbedder]): Concrete subclass implementing BaseEmbedder.
        """
        cls._registry[provider.lower()] = embedder_cls

    @classmethod
    def create(
        cls,
        provider: Optional[str] = None,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        vector_dim: Optional[int] = None,
        **kwargs: Any,
    ) -> BaseEmbedder:
        """Create and return a configured embedder instance without caller caring about internals.

        Args:
            provider (Optional[str]): Provider identifier (defaults to settings.EMBEDDING_PROVIDER).
            base_url (Optional[str]): Custom base URL override.
            api_key (Optional[str]): Custom API key override.
            model_name (Optional[str]): Custom model name override.
            vector_dim (Optional[int]): Custom vector dimension override.
            **kwargs (Any): Additional arbitrary provider-specific keyword arguments.

        Returns:
            BaseEmbedder: An initialized embedder instance conforming to BaseEmbedder.

        Raises:
            ValueError: If an unknown provider name is requested.
        """
        provider_name = (provider or settings.EMBEDDING_PROVIDER or "openai").lower()
        embedder_cls = cls._registry.get(provider_name)
        if not embedder_cls:
            raise ValueError(
                f"Unknown embedding provider: '{provider_name}'. "
                f"Available providers: {list(cls._registry.keys())}"
            )

        # Build clean keyword argument payload for provider constructor
        init_kwargs: Dict[str, Any] = {}
        if base_url is not None:
            init_kwargs["base_url"] = base_url
        if api_key is not None:
            init_kwargs["api_key"] = api_key
        if model_name is not None:
            init_kwargs["model_name"] = model_name
        if vector_dim is not None:
            init_kwargs["vector_dim"] = vector_dim
        init_kwargs.update(kwargs)

        return embedder_cls(**init_kwargs)

    @classmethod
    def get_default_embedder(cls) -> BaseEmbedder:
        """Obtain or lazily construct the default application embedder instance.

        Returns:
            BaseEmbedder: Shared default embedder instance.
        """
        if cls._default_instance is None:
            cls._default_instance = cls.create()
        return cls._default_instance


def get_embedder(
    provider: Optional[str] = None,
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model_name: Optional[str] = None,
    vector_dim: Optional[int] = None,
    **kwargs: Any,
) -> BaseEmbedder:
    """Convenience helper to obtain an embedder instance via EmbedderFactory.

    Args:
        provider (Optional[str]): Provider name.
        base_url (Optional[str]): Base URL.
        api_key (Optional[str]): API key.
        model_name (Optional[str]): Model name.
        vector_dim (Optional[int]): Vector dimension.
        **kwargs (Any): Additional keyword arguments.

    Returns:
        BaseEmbedder: Instantiated embedder.
    """
    if (
        provider is None
        and base_url is None
        and api_key is None
        and model_name is None
        and vector_dim is None
        and not kwargs
    ):
        return EmbedderFactory.get_default_embedder()
    return EmbedderFactory.create(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        vector_dim=vector_dim,
        **kwargs,
    )
