"""MinIO Object Storage integration service for streaming document binaries.

Encapsulates MinIO / AWS S3 client operations to safely stream and download
raw decree files (.docx, .pdf) directly from dedicated bucket storage, avoiding
in-memory base64 serialization and payload bloat across internal services.
"""

import logging
from typing import Optional

from minio import Minio

from src.config import settings

logger = logging.getLogger(__name__)


class MinioStorageService:
    """Encapsulates MinIO client interactions for object storage download and streaming.

    Attributes:
        endpoint (str): Formatted MinIO host endpoint (e.g. "localhost:9000" or "minio:9000").
        access_key (str): MinIO root or service access key ID.
        secret_key (str): MinIO secret access key.
        bucket (str): Target bucket containing legal documents ("traffic-ioc-documents").
        secure (bool): Whether to use HTTPS/TLS (default: False for internal dev/docker network).
    """

    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket: Optional[str] = None,
        secure: Optional[bool] = None,
    ) -> None:
        """Initialize MinIO storage client configuration.

        Args:
            endpoint (Optional[str]): Custom host endpoint override.
            access_key (Optional[str]): Custom access key ID override.
            secret_key (Optional[str]): Custom secret access key override.
            bucket (Optional[str]): Target bucket name override.
            secure (Optional[bool]): Flag indicating SSL/TLS connection.
        """
        raw_endpoint = endpoint or settings.MINIO_ENDPOINT
        self.endpoint = raw_endpoint.replace("http://", "").replace("https://", "")
        self.access_key = access_key or settings.MINIO_ACCESS_KEY
        self.secret_key = secret_key or settings.MINIO_SECRET_KEY
        self.bucket = bucket or settings.MINIO_BUCKET
        self.secure = secure if secure is not None else settings.MINIO_SECURE
        self._client: Optional[Minio] = None

    def get_client(self) -> Minio:
        """Instantiate and return singleton MinIO client instance.

        Returns:
            Minio: Connected MinIO client instance.
        """
        if self._client is None:
            self._client = Minio(
                self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure,
            )
        return self._client

    def download_file_bytes(self, storage_key: str) -> bytes:
        """Download raw object bytes from the configured MinIO bucket.

        Args:
            storage_key (str): Object storage key path within the bucket (e.g. "laws/ND-100-2019/file.pdf").

        Returns:
            bytes: Complete raw binary content of the target document object.

        Raises:
            Exception: If object does not exist, network connection fails, or read permissions are denied.
        """
        client = self.get_client()
        try:
            response = client.get_object(self.bucket, storage_key)
            try:
                data = response.read()
                logger.info(
                    f"✓ Downloaded {len(data)} bytes from MinIO s3://{self.bucket}/{storage_key}"
                )
                return data
            finally:
                response.close()
                response.release_conn()
        except Exception as e:
            logger.error(f"Error downloading s3://{self.bucket}/{storage_key}: {e}")
            raise


minio_storage = MinioStorageService()
