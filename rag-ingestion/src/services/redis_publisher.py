"""Redis Pub/Sub Event Publisher for asynchronous RAG ingestion milestones.

Decouples long-running ingestion processing steps (OCR, AST parsing, embeddings,
and storage writes) from the HTTP API Gateway. Milestone progress notifications
are broadcast in real-time over Redis channels to be consumed by backend SSE listeners.
"""

import json
import logging
from typing import Any, Dict, Optional

import redis.asyncio as aioredis

from src.core.config import settings

logger = logging.getLogger(__name__)


class RedisPublisher:
    """Publishes ingestion milestone progress events to Redis Pub/Sub channels.

    Attributes:
        redis_url (str): Connection URI for the Redis broker instance.
        channel (str): Topic channel name (e.g. "rag:ingestion:events").
    """

    def __init__(self, redis_url: Optional[str] = None, channel: Optional[str] = None) -> None:
        """Initialize Redis publisher configuration.

        Args:
            redis_url (Optional[str]): Custom Redis connection URL override.
            channel (Optional[str]): Custom topic channel name override.
        """
        self.redis_url = redis_url or settings.REDIS_URL
        self.channel = channel or settings.REDIS_INGESTION_CHANNEL
        self._client: Optional[aioredis.Redis] = None

    async def get_client(self) -> Optional[aioredis.Redis]:
        """Obtain or lazily establish the asynchronous Redis client connection pool.

        Returns:
            Optional[aioredis.Redis]: Active async Redis connection instance, or None if connection failed.
        """
        if self._client is None:
            try:
                self._client = aioredis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
            except Exception as e:
                logger.warning(f"Failed to connect to Redis at {self.redis_url}: {e}")
                self._client = None
        return self._client

    async def publish_event(
        self,
        job_id: str,
        doc_code: str,
        event: str,
        data: Dict[str, Any],
    ) -> bool:
        """Publish a structured milestone or error event payload to the Redis ingestion topic.

        Args:
            job_id (str): Background tracking job UUID.
            doc_code (str): Unique legislation document code (e.g. "100/2019/ND-CP").
            event (str): Event category token: "progress", "complete", or "error".
            data (Dict[str, Any]): Detailed event payload containing progress step, percentage, and metrics.

        Returns:
            bool: True if the message was successfully dispatched to Redis, False otherwise.
        """
        payload = {
            "jobId": job_id,
            "docCode": doc_code,
            "event": event,
            "data": data,
        }
        try:
            client = await self.get_client()
            if client is not None:
                message = json.dumps(payload, ensure_ascii=False)
                await client.publish(self.channel, message)
                logger.info(f"Published event '{event}' for job {job_id} to {self.channel}")
                return True
        except Exception as e:
            logger.error(f"Error publishing Redis event for job {job_id}: {e}")
        return False

    async def close(self) -> None:
        """Gracefully terminate active Redis connection pools on service shutdown."""
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None


redis_publisher = RedisPublisher()
