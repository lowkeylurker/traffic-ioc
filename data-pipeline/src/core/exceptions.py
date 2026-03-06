"""Custom exceptions cho data-pipeline module.

Cây kế thừa:
    PipelineError (Exception)
    ├── DataExtractionError   ← Extractor thất bại
    ├── DataValidationError   ← Pydantic reject / schema lỗi
    └── DatabaseLoadError     ← UPSERT vào DB lỗi
"""

from __future__ import annotations


class PipelineError(Exception):
    """Base exception cho toàn bộ data-pipeline."""

    def __init__(self, message: str, detail: str | None = None) -> None:
        self.message = message
        self.detail = detail
        super().__init__(self.message)

    def __str__(self) -> str:
        if self.detail:
            return f"{self.message} | Detail: {self.detail}"
        return self.message


class DataExtractionError(PipelineError):
    """Extractor gọi API thất bại sau hết retry.

    Khi nào raise:
      - HTTP status không retry-able (400, 401, 403, 404)
      - Hết MAX_RETRIES lần cho retry-able errors
      - Response không phải JSON hợp lệ
    """

    pass


class DataValidationError(PipelineError):
    """Pydantic schema reject dữ liệu.

    Khi nào raise:
      - >50% records trong 1 batch bị invalid
      - Required field bị thiếu
      - Field type không match
    """

    pass


class DatabaseLoadError(PipelineError):
    """INSERT / UPSERT vào PostgreSQL thất bại.

    Khi nào raise:
      - IntegrityError (FK violation, CHECK constraint)
      - OperationalError (connection lost giữa transaction)
      - Timeout khi execute batch lớn
    """

    pass
