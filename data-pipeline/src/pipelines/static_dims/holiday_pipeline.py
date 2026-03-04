"""Holiday Dimension Pipeline.

Sinh + UPSERT dữ liệu cho:
  - dim_holiday     (danh mục ngày lễ VN)
  - bridge_date_holiday (many-to-many ngày ↔ lễ)

KHÔNG có Extractor (dữ liệu hardcode danh mục lễ VN + seed data).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Engine

from src.core.logger import get_logger
from src.pipelines.base import BaseLoader, BaseTransformer

# ═══════════════════════════════════════════════════════════
# HOLIDAY CATALOG (ngày lễ chính thức VN)
# ═══════════════════════════════════════════════════════════

_HOLIDAYS = [
    {
        "holiday_key": 1,
        "holiday_name_vi": "Tết Dương lịch",
        "duration_days": 1,
        "is_public_holiday": True,
    },
    {
        "holiday_key": 2,
        "holiday_name_vi": "Tết Nguyên Đán",
        "duration_days": 7,
        "is_public_holiday": True,
    },
    {
        "holiday_key": 3,
        "holiday_name_vi": "Giỗ Tổ Hùng Vương",
        "duration_days": 1,
        "is_public_holiday": True,
    },
    {
        "holiday_key": 4,
        "holiday_name_vi": "Ngày Giải phóng miền Nam",
        "duration_days": 1,
        "is_public_holiday": True,
    },
    {
        "holiday_key": 5,
        "holiday_name_vi": "Ngày Quốc tế Lao động",
        "duration_days": 1,
        "is_public_holiday": True,
    },
    {
        "holiday_key": 6,
        "holiday_name_vi": "Quốc khánh",
        "duration_days": 2,
        "is_public_holiday": True,
    },
]

# Mapping cố định: holiday_key → list[date] cho 2024–2027
# Tết Nguyên Đán ngày âm lịch thay đổi hằng năm → cần hardcode
_HOLIDAY_DATES: dict[int, list[date]] = {
    # 1: Tết Dương lịch
    1: [date(y, 1, 1) for y in range(2024, 2028)],
    # 2: Tết Nguyên Đán (approximate, 7 ngày mỗi năm)
    2: [
        # 2024: 8–14 Feb (Giáp Thìn)
        *[date(2024, 2, d) for d in range(8, 15)],
        # 2025: 27 Jan – 2 Feb (Ất Tỵ)
        *[date(2025, 1, d) for d in range(27, 32)],
        *[date(2025, 2, d) for d in range(1, 3)],
        # 2026: 15–21 Feb (Bính Ngọ)
        *[date(2026, 2, d) for d in range(15, 22)],
        # 2027: 5–11 Feb (Đinh Mùi)
        *[date(2027, 2, d) for d in range(5, 12)],
    ],
    # 3: Giỗ Tổ Hùng Vương (10/3 âm lịch → approximate)
    3: [date(2024, 4, 18), date(2025, 4, 7), date(2026, 4, 26), date(2027, 4, 16)],
    # 4: 30/4 Giải phóng
    4: [date(y, 4, 30) for y in range(2024, 2028)],
    # 5: 1/5 Quốc tế Lao động
    5: [date(y, 5, 1) for y in range(2024, 2028)],
    # 6: 2/9 Quốc khánh (2 ngày: 2/9 + 3/9)
    6: [
        *[(date(y, 9, 2)) for y in range(2024, 2028)],
        *[(date(y, 9, 3)) for y in range(2024, 2028)],
    ],
}


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class HolidayTransformer(BaseTransformer):
    """Sinh dim_holiday + bridge_date_holiday rows."""

    def transform(self, raw_data: None = None) -> dict[str, list[dict]]:
        now = datetime.utcnow()
        holidays = []
        for h in _HOLIDAYS:
            holidays.append({**h, "record_timestamp": now})

        bridge = []
        for hkey, dates in _HOLIDAY_DATES.items():
            for d in dates:
                date_key = int(d.strftime("%Y%m%d"))
                bridge.append({"date_key": date_key, "holiday_key": hkey})

        self.logger.info(
            f"Generated {len(holidays)} dim_holiday, "
            f"{len(bridge)} bridge_date_holiday rows"
        )
        return {"dim_holiday": holidays, "bridge_date_holiday": bridge}


# ═══════════════════════════════════════════════════════════
# LOADERS
# ═══════════════════════════════════════════════════════════


class HolidayLoader(BaseLoader):
    TABLE_NAME = "dim_holiday"
    CONFLICT_KEYS = ["holiday_key"]
    UPDATE_COLUMNS = []
    BATCH_SIZE = 50

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class BridgeDateHolidayLoader(BaseLoader):
    TABLE_NAME = "bridge_date_holiday"
    CONFLICT_KEYS = ["date_key", "holiday_key"]
    UPDATE_COLUMNS = []
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """Sinh + UPSERT dim_holiday + bridge_date_holiday.

    Pre-condition: dim_date đã load xong (FK bridge → dim_date).

    Returns:
        int: Tổng record đã upsert.
    """
    logger = get_logger("holiday_pipeline")
    total = 0

    transformer = HolidayTransformer()
    data = transformer.transform()

    # dim_holiday trước bridge
    hloader = HolidayLoader(engine)
    c = hloader.load(data["dim_holiday"])
    logger.info(f"Loaded {c} records → dim_holiday")
    total += c

    bloader = BridgeDateHolidayLoader(engine)
    c = bloader.load(data["bridge_date_holiday"])
    logger.info(f"Loaded {c} records → bridge_date_holiday")
    total += c

    return total
