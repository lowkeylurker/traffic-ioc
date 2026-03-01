"""Location Dimension Pipeline.

Populate dim_location từ hardcoded danh sách Phường/Quận TP.HCM Quận 1.
(Phase 2 có thể mở rộng reverse geocode từ segment centroids.)

Đây là danh mục tĩnh → DO NOTHING on conflict.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from sqlalchemy import Engine

from src.core.logger import get_logger
from src.pipelines.base import BaseLoader, BaseTransformer

# ═══════════════════════════════════════════════════════════
# WARD DATA (Phường Quận 1, TP.HCM)
# ═══════════════════════════════════════════════════════════

_WARDS_DISTRICT_1 = [
    "Bến Nghé",
    "Bến Thành",
    "Cầu Kho",
    "Cầu Ông Lãnh",
    "Cô Giang",
    "Đa Kao",
    "Nguyễn Cư Trinh",
    "Nguyễn Thái Bình",
    "Phạm Ngũ Lão",
    "Tân Định",
]


def _generate_location_key(ward: str, district: str) -> int:
    """Sinh location_key (BIGINT) từ ward+district hash."""
    raw = f"{ward}_{district}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15], 16)


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class LocationTransformer(BaseTransformer):
    """Sinh dim_location rows từ catalog."""

    def transform(self, raw_data: None = None) -> list[dict]:
        now = datetime.utcnow()
        records = []
        for ward in _WARDS_DISTRICT_1:
            records.append(
                {
                    "location_key": _generate_location_key(ward, "Quận 1"),
                    "ward": ward,
                    "district": "Quận 1",
                    "city": "Hồ Chí Minh",
                    "record_timestamp": now,
                }
            )
        self.logger.info(f"Generated {len(records)} dim_location records")
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class LocationLoader(BaseLoader):
    TABLE_NAME = "dim_location"
    CONFLICT_KEYS = ["location_key"]
    UPDATE_COLUMNS = []  # DO NOTHING
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """UPSERT dim_location (phường Quận 1).

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("location_pipeline")

    transformer = LocationTransformer()
    records = transformer.transform()

    loader = LocationLoader(engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → dim_location")
    return count
