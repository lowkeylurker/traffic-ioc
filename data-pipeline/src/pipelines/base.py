"""Abstract Base Classes cho Extractor / Transformer / Loader.

Mọi pipeline cụ thể (traffic, weather, osm...) PHẢI kế thừa từ 3 ABC ở đây.
Không tự chế pattern riêng.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

import requests
from sqlalchemy import Engine, MetaData, Table, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Session
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_fixed,
)

from src.core.exceptions import (
    DataExtractionError,
    DataValidationError,
    DatabaseLoadError,
)
from src.core.logger import get_logger

# ═══════════════════════════════════════════════════════════
# SHARED METADATA – reflect tables once, share across loaders
# ═══════════════════════════════════════════════════════════

_metadata = MetaData()


def get_table(table_name: str, engine: Engine) -> Table:
    """Reflect (lazy) 1 table từ PostgreSQL metadata.

    Cách dùng trong Loader subclass::

        TABLE = get_table("fact_traffic_flow", engine)
    """
    if table_name not in _metadata.tables:
        _metadata.reflect(bind=engine, only=[table_name])
    return _metadata.tables[table_name]


# ═══════════════════════════════════════════════════════════
# 1. BASE EXTRACTOR
# ═══════════════════════════════════════════════════════════


class BaseExtractor(ABC):
    """Abstract base class cho mọi Extractor.

    Trách nhiệm:
      - Gọi API bên ngoài (TomTom, OpenWeather, OSM…) hoặc đọc file.
      - Tự động retry khi gặp lỗi mạng / rate-limit.
      - Raise DataExtractionError nếu thất bại sau hết retry.

    Subclass bắt buộc implement:
      - extract(**kwargs) -> Any
    """

    BASE_URL: str = ""
    DEFAULT_TIMEOUT: int = 10
    MAX_RETRIES: int = 3
    RETRY_WAIT: int = 2

    def __init__(self, api_key: str = "", **kwargs: Any) -> None:
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "traffic-ioc-data-pipeline/1.0",
            }
        )
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def extract(self, **kwargs: Any) -> Any:
        """Trích xuất dữ liệu thô từ nguồn ngoài.

        Returns:
            Any: Dữ liệu thô (dict, list[dict], GeoDataFrame…).

        Raises:
            DataExtractionError: Khi thất bại sau MAX_RETRIES lần.
        """
        ...

    # ── HTTP GET helper ───────────────────────────────────────
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_fixed(2),
        retry=retry_if_exception_type(
            (requests.ConnectionError, requests.Timeout, requests.HTTPError)
        ),
        before_sleep=before_sleep_log(
            logging.getLogger("tenacity"), logging.WARNING
        ),
        reraise=True,
    )
    def _get(self, url: str, params: dict | None = None) -> dict:
        """HTTP GET có retry tự động.

        Retry khi ConnectionError / Timeout / HTTPError (429, 5xx).
        Không retry 400/401/403/404.
        """
        self.logger.debug(f"GET {url} params={params}")
        response = self.session.get(
            url, params=params, timeout=self.DEFAULT_TIMEOUT
        )

        # Retry-able HTTP errors
        if response.status_code in (429, 500, 502, 503, 504):
            self.logger.warning(
                f"HTTP {response.status_code} from {url}, will retry..."
            )
            response.raise_for_status()

        # Non-retryable
        if not response.ok:
            raise DataExtractionError(
                message=f"HTTP {response.status_code} from {url}",
                detail=response.text[:500],
            )

        return response.json()


# ═══════════════════════════════════════════════════════════
# 2. BASE TRANSFORMER
# ═══════════════════════════════════════════════════════════


class BaseTransformer(ABC):
    """Abstract base class cho mọi Transformer.

    RÀNG BUỘC TUYỆT ĐỐI:
      - KHÔNG gọi API. KHÔNG query DB. KHÔNG ghi file.
      - Là PURE FUNCTION (ngoại trừ logging).

    Subclass bắt buộc implement:
      - transform(raw_data) -> list[dict]
    """

    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def transform(self, raw_data: Any) -> list[dict]:
        """Biến đổi dữ liệu thô → list[dict] sẵn sàng load DB.

        Args:
            raw_data: Output từ Extractor.extract().

        Returns:
            list[dict]: Mỗi dict = 1 row DB (key = tên cột DB snake_case).

        Raises:
            DataValidationError: Khi Pydantic schema reject dữ liệu.
        """
        ...


# ═══════════════════════════════════════════════════════════
# 3. BASE LOADER
# ═══════════════════════════════════════════════════════════


class BaseLoader(ABC):
    """Abstract base class cho mọi Loader.

    Trách nhiệm:
      - Nhận list[dict] từ Transformer.
      - UPSERT vào PostgreSQL (ON CONFLICT).

    RÀNG BUỘC:
      - BẮT BUỘC dùng UPSERT (pg_insert ON CONFLICT). Cấm session.add().
      - BẮT BUỘC batch insert.

    Subclass bắt buộc gán:
      - TABLE_NAME: str
      - CONFLICT_KEYS: list[str]
      - UPDATE_COLUMNS: list[str]
    """

    TABLE_NAME: str = ""
    CONFLICT_KEYS: list[str] = []
    UPDATE_COLUMNS: list[str] = []
    BATCH_SIZE: int = 500

    def __init__(self, engine: Engine) -> None:
        self.engine = engine
        self.logger = get_logger(self.__class__.__name__)
        self._table: Table | None = None

    @property
    def table(self) -> Table:
        """Lazy-reflect table from database metadata."""
        if self._table is None:
            self._table = get_table(self.TABLE_NAME, self.engine)
        return self._table

    # ── Partition helpers ────────────────────────────────────

    def _ensure_partitions(self, records: list[dict]) -> None:
        """Auto-create monthly partitions for all date_keys found in records.

        Only applies if the table is partitioned (has 'date_key' column).
        Idempotent: silently skips if partition already exists.
        """
        if not records or "date_key" not in records[0]:
            return

        # Collect unique YYYYMM from date_keys
        months_seen: set[str] = set()
        for r in records:
            dk = r.get("date_key")
            if dk:
                months_seen.add(str(dk)[:6])  # "202603"

        with Session(self.engine) as session:
            for ym in sorted(months_seen):
                year = int(ym[:4])
                month = int(ym[4:6])
                from_key = int(f"{year}{month:02d}01")
                # Next month
                if month == 12:
                    to_key = int(f"{year + 1}0101")
                else:
                    to_key = int(f"{year}{month + 1:02d}01")

                part_name = f"{self.TABLE_NAME}_{ym}"
                create_sql = (
                    f"CREATE TABLE IF NOT EXISTS {part_name} "
                    f"PARTITION OF {self.TABLE_NAME} "
                    f"FOR VALUES FROM ({from_key}) TO ({to_key})"
                )
                try:
                    session.execute(text(create_sql))
                    session.commit()
                    self.logger.info(f"Ensured partition {part_name}")
                except (ProgrammingError, OperationalError) as e:
                    session.rollback()
                    # Partition already exists or other non-fatal error
                    if "already exists" in str(e):
                        self.logger.debug(f"Partition {part_name} already exists")
                    else:
                        self.logger.warning(f"Could not create partition {part_name}: {e}")

    @abstractmethod
    def load(self, records: list[dict]) -> int:
        """Nạp dữ liệu bằng UPSERT.

        Args:
            records: Output từ Transformer.transform().

        Returns:
            int: Số record đã upsert thành công.

        Raises:
            DatabaseLoadError: Khi INSERT/UPSERT thất bại.
        """
        ...

    def _upsert_batch(self, records: list[dict]) -> int:
        """Helper UPSERT dùng pg_insert ON CONFLICT.

        Auto-commit khi OK, auto-rollback khi lỗi.
        Auto-creates monthly partitions if needed.
        """
        if not records:
            return 0

        self._ensure_partitions(records)
        total_upserted = 0

        for i in range(0, len(records), self.BATCH_SIZE):
            batch = records[i : i + self.BATCH_SIZE]

            with Session(self.engine) as session:
                try:
                    stmt = pg_insert(self.table).values(batch)

                    if self.UPDATE_COLUMNS:
                        update_dict = {
                            col: stmt.excluded[col] for col in self.UPDATE_COLUMNS
                        }
                        stmt = stmt.on_conflict_do_update(
                            index_elements=self.CONFLICT_KEYS,
                            set_=update_dict,
                        )
                    else:
                        stmt = stmt.on_conflict_do_nothing(
                            index_elements=self.CONFLICT_KEYS,
                        )

                    result = session.execute(stmt)
                    session.commit()
                    total_upserted += result.rowcount

                    self.logger.info(
                        f"Batch {i // self.BATCH_SIZE + 1}: "
                        f"upserted {result.rowcount}/{len(batch)} rows"
                    )

                except (IntegrityError, OperationalError) as e:
                    session.rollback()
                    self.logger.error(
                        f"DB error in batch {i // self.BATCH_SIZE + 1}: {e}"
                    )
                    raise DatabaseLoadError(
                        message=f"UPSERT failed on {self.TABLE_NAME}",
                        detail=str(e),
                    )

        return total_upserted

    def _upsert_raw_sql(self, sql: str, records: list[dict]) -> int:
        """Helper cho bảng có PostGIS geometry (cần ST_GeomFromText).

        Dùng raw SQL text binding thay vì pg_insert.
        Auto-creates monthly partitions if needed.
        """
        if not records:
            return 0

        self._ensure_partitions(records)
        total = 0
        stmt = text(sql)

        for i in range(0, len(records), self.BATCH_SIZE):
            batch = records[i : i + self.BATCH_SIZE]

            with Session(self.engine) as session:
                try:
                    for row in batch:
                        session.execute(stmt, row)
                    session.commit()
                    total += len(batch)

                    self.logger.info(
                        f"Batch {i // self.BATCH_SIZE + 1}: "
                        f"upserted {len(batch)} rows (raw SQL)"
                    )

                except (IntegrityError, OperationalError) as e:
                    session.rollback()
                    self.logger.error(
                        f"DB error in batch {i // self.BATCH_SIZE + 1}: {e}"
                    )
                    raise DatabaseLoadError(
                        message=f"UPSERT failed on {self.TABLE_NAME} (raw SQL)",
                        detail=str(e),
                    )

        return total
