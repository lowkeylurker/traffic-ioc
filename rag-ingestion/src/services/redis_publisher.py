"""Redis Pub/Sub Event Publisher for asynchronous RAG ingestion milestones."""

import json
import logging
from typing import Any, Dict, Optional

from src.config import settings

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis
except ImportError:
    try:
        import redis as aioredis  # type: ignore
    except ImportError:
        aioredis = None  # type: ignore


class RedisPublisher:
    """Publishes ingestion milestone progress events to Redis Pub/Sub."""

    def __init__(self, redis_url: Optional[str] = None, channel: Optional[str] = None):
        self.redis_url = redis_url or settings.REDIS_URL
        self.channel = channel or settings.REDIS_INGESTION_CHANNEL
        self._client: Optional[Any] = None

    async def get_client(self):
        if self._client is None and aioredis is not None:
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
        """Publishes an event to the Redis ingestion channel."""
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

    async def close(self):
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:
                pass
            self._client = None


redis_publisher = RedisPublisher()
