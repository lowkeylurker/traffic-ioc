"""Date/Time Static Dimension Generator.

Sinh dữ liệu cho các bảng dimension thời gian:
  - dim_month_year (48 rows: 2024–2027)
  - dim_shift      (4 rows: SANG/TRUA/CHIEU/DEM)
  - dim_date       (~1461 rows: 4 năm)
  - dim_time_of_day (1440 rows: 0–1439 phút)

KHÔNG có Extractor (sinh từ code). Transformer + Loader pattern giữ nguyên.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta

from sqlalchemy import Engine

from src.core.logger import get_logger
from src.pipelines.base import BaseLoader, BaseTransformer

# ═══════════════════════════════════════════════════════════
# TRANSFORMER (giữ vai trò Generator ở đây)
# ═══════════════════════════════════════════════════════════

_MONTH_NAMES_VI = [
    "", "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
    "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
    "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
]

_QUARTER_NAMES_VI = ["", "Quý 1", "Quý 2", "Quý 3", "Quý 4"]

_DAY_NAMES_VI = [
    "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm",
    "Thứ Sáu", "Thứ Bảy", "Chủ Nhật",
]

_SHIFTS = [
    # Ban đêm (Night): 22–5
    {
        "shift_key": 1,
        "shift_code": "NIGHT",
        "shift_name_vi": "Ban đêm",
        "start_hour": 22,
        "end_hour": 5,
        "is_peak_hour": False,
        "record_timestamp": None,
    },
    # Sáng sớm (Early Morning): 6
    {
        "shift_key": 2,
        "shift_code": "EARLY_MORNING",
        "shift_name_vi": "Sáng sớm",
        "start_hour": 6,
        "end_hour": 6,
        "is_peak_hour": False,
        "record_timestamp": None,
    },
    # Cao điểm sáng (Morning Peak): 7–9
    {
        "shift_key": 3,
        "shift_code": "MORNING_PEAK",
        "shift_name_vi": "Cao điểm sáng",
        "start_hour": 7,
        "end_hour": 9,
        "is_peak_hour": True,
        "record_timestamp": None,
    },
    # Bình thường ngày (Daytime Off-peak): 10–16
    {
        "shift_key": 4,
        "shift_code": "DAYTIME_OFFPEAK",
        "shift_name_vi": "Bình thường ngày",
        "start_hour": 10,
        "end_hour": 16,
        "is_peak_hour": False,
        "record_timestamp": None,
    },
    # Cao điểm chiều (Evening Peak): 17–19
    {
        "shift_key": 5,
        "shift_code": "EVENING_PEAK",
        "shift_name_vi": "Cao điểm chiều",
        "start_hour": 17,
        "end_hour": 19,
        "is_peak_hour": True,
        "record_timestamp": None,
    },
    # Buổi tối (Evening): 20–21
    {
        "shift_key": 6,
        "shift_code": "EVENING",
        "shift_name_vi": "Buổi tối",
        "start_hour": 20,
        "end_hour": 21,
        "is_peak_hour": False,
        "record_timestamp": None,
    },
    # Không xác định (Unknown/Default)
    {
        "shift_key": 99,
        "shift_code": "UNKNOWN",
        "shift_name_vi": "Không xác định",
        "start_hour": -1,
        "end_hour": -1,
        "is_peak_hour": False,
        "record_timestamp": None,
    },
]


class DateTimeTransformer(BaseTransformer):
    """Sinh list[dict] cho 4 bảng dimension thời gian."""

    START_YEAR: int = 2024
    END_YEAR: int = 2027

    def transform(self, raw_data: None = None) -> dict[str, list[dict]]:
        """Sinh toàn bộ dữ liệu thời gian. Trả dict 4 key.

        Returns:
            {
                "dim_month_year": [...],
                "dim_shift": [...],
                "dim_date": [...],
                "dim_time_of_day": [...],
            }
        """
        return {
            "dim_month_year": self._gen_month_year(),
            "dim_shift": self._gen_shift(),
            "dim_date": self._gen_date(),
            "dim_time_of_day": self._gen_time_of_day(),
        }

    # ── dim_month_year ────────────────────────────────────
    def _gen_month_year(self) -> list[dict]:
        rows = []
        for year in range(self.START_YEAR, self.END_YEAR + 1):
            is_leap = calendar.isleap(year)
            days_in_year = 366 if is_leap else 365
            for month in range(1, 13):
                days = calendar.monthrange(year, month)[1]
                quarter = (month - 1) // 3 + 1
                rows.append(
                    {
                        "month_year_key": year * 100 + month,
                        "month_number": month,
                        "month_name_vi": _MONTH_NAMES_VI[month],
                        "month_start_date": date(year, month, 1),
                        "month_end_date": date(year, month, days),
                        "days_in_month": days,
                        "quarter_number": quarter,
                        "quarter_name": _QUARTER_NAMES_VI[quarter],
                        "year": year,
                        "days_in_year": days_in_year,
                        "is_leap_year": is_leap,
                    }
                )
        self.logger.info(f"Generated {len(rows)} dim_month_year rows")
        return rows

    # ── dim_shift ─────────────────────────────────────────
    def _gen_shift(self) -> list[dict]:
        rows = []
        now = datetime.utcnow()
        for s in _SHIFTS:
            row = dict(s)
            row["record_timestamp"] = now
            rows.append(row)
        self.logger.info(f"Generated {len(rows)} dim_shift rows")
        return rows

    # ── dim_date ──────────────────────────────────────────
    def _gen_date(self) -> list[dict]:
        rows = []
        start = date(self.START_YEAR, 1, 1)
        end = date(self.END_YEAR, 12, 31)
        current = start
        while current <= end:
            # isoweekday: 1=Mon..7=Sun
            dow = current.isoweekday()
            month_days = calendar.monthrange(current.year, current.month)[1]
            rows.append(
                {
                    "date_key": int(current.strftime("%Y%m%d")),
                    "month_year_key": current.year * 100 + current.month,
                    "full_date": current,
                    "day_of_week": dow,
                    "day_name_vi": _DAY_NAMES_VI[dow - 1],
                    "iso_week": current.isocalendar()[1],
                    "is_weekend": dow >= 6,
                    "is_holiday": False,  # Updated later by holiday_pipeline
                    "is_end_of_month": current.day == month_days,
                }
            )
            current += timedelta(days=1)
        self.logger.info(f"Generated {len(rows)} dim_date rows")
        return rows

    # ── dim_time_of_day ───────────────────────────────────
    def _gen_time_of_day(self) -> list[dict]:
        rows = []
        for minute in range(1440):
            hh = minute // 60
            mm = minute % 60
            hhmm = hh * 100 + mm

            # Determine shift based on 7-shift model per spec
            if (22 <= hh <= 23) or (0 <= hh <= 5):
                shift_key = 1  # NIGHT (22–5)
            elif hh == 6:
                shift_key = 2  # EARLY_MORNING (6)
            elif 7 <= hh <= 9:
                shift_key = 3  # MORNING_PEAK (7–9)
            elif 10 <= hh <= 16:
                shift_key = 4  # DAYTIME_OFFPEAK (10–16)
            elif 17 <= hh <= 19:
                shift_key = 5  # EVENING_PEAK (17–19)
            elif 20 <= hh <= 21:
                shift_key = 6  # EVENING (20–21)
            else:
                shift_key = 99  # UNKNOWN (fallback)

            # is_business_hours: peak hours (7–9) + (17–19)
            is_biz = (7 <= hh <= 9) or (17 <= hh <= 19)

            rows.append(
                {
                    "time_key": minute,
                    "default_shift_key": shift_key,
                    "hhmm": hhmm,
                    "bucket_5min_key": minute // 5,
                    "bucket_15min_key": minute // 15,
                    "bucket_60min_key": minute // 60,
                    "is_business_hours": is_biz,
                }
            )
        self.logger.info(f"Generated {len(rows)} dim_time_of_day rows")
        return rows


# ═══════════════════════════════════════════════════════════
# LOADERS
# ═══════════════════════════════════════════════════════════


class MonthYearLoader(BaseLoader):
    TABLE_NAME = "dim_month_year"
    CONFLICT_KEYS = ["month_year_key"]
    UPDATE_COLUMNS = []  # DO NOTHING
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class ShiftLoader(BaseLoader):
    TABLE_NAME = "dim_shift"
    CONFLICT_KEYS = ["shift_key"]
    UPDATE_COLUMNS = ["shift_code", "shift_name_vi", "start_hour", "end_hour", "is_peak_hour", "record_timestamp"]
    BATCH_SIZE = 10

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class DateLoader(BaseLoader):
    TABLE_NAME = "dim_date"
    CONFLICT_KEYS = ["date_key"]
    UPDATE_COLUMNS = []
    BATCH_SIZE = 500

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


class TimeOfDayLoader(BaseLoader):
    TABLE_NAME = "dim_time_of_day"
    CONFLICT_KEYS = ["time_key"]
    UPDATE_COLUMNS = ["default_shift_key", "hhmm", "bucket_5min_key", "bucket_15min_key", "bucket_60min_key", "is_business_hours"]
    BATCH_SIZE = 500

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """Sinh + UPSERT toàn bộ dimension thời gian.

    Thứ tự FK:
        ① dim_month_year
        ② dim_shift
        ③ dim_date (FK → dim_month_year)
        ④ dim_time_of_day (FK → dim_shift)

    Returns:
        int: Tổng record đã upsert.
    """
    logger = get_logger("date_time_pipeline")
    total = 0

    # Transform (generate)
    transformer = DateTimeTransformer()
    data = transformer.transform()

    # Load in FK order
    loaders: list[tuple[str, BaseLoader, list[dict]]] = [
        ("dim_month_year", MonthYearLoader(engine), data["dim_month_year"]),
        ("dim_shift", ShiftLoader(engine), data["dim_shift"]),
        ("dim_date", DateLoader(engine), data["dim_date"]),
        ("dim_time_of_day", TimeOfDayLoader(engine), data["dim_time_of_day"]),
    ]

    for name, loader, records in loaders:
        count = loader.load(records)
        logger.info(f"Loaded {count} records → {name}")
        total += count

    return total
