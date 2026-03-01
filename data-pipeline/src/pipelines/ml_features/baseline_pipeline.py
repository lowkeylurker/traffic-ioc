"""Baseline Speed Pipeline (Nightly Batch).

Tính vận tốc trung bình lịch sử (baseline) cho mỗi segment × time_key × day_of_week.
Đọc từ fact_traffic_flow, aggregate, ghi kết quả dạng materialized view hoặc bảng cache.

Phase 2 – scaffold. Logic chi tiết sẽ expand khi AI-core cần features.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Engine, text

from src.core.logger import get_logger
from src.pipelines.base import BaseTransformer


# ═══════════════════════════════════════════════════════════
# TRANSFORMER (Query-based – đọc từ fact table)
# ═══════════════════════════════════════════════════════════


class BaselineTransformer(BaseTransformer):
    """Tính baseline speed = AVG(current_speed_kmh) per segment × time × dow."""

    def transform(self, raw_data: list[dict]) -> list[dict]:
        """raw_data = rows from SQL aggregation query.

        Mỗi row dict:
            segment_key, time_key, day_of_week,
            avg_speed, avg_travel_time, sample_count
        """
        records = []
        now = datetime.utcnow()
        for row in raw_data:
            records.append(
                {
                    "segment_key": row["segment_key"],
                    "time_key": row["time_key"],
                    "day_of_week": row["day_of_week"],
                    "avg_speed_kmh": round(float(row["avg_speed"]), 2),
                    "avg_travel_time": int(row.get("avg_travel_time", 0)),
                    "sample_count": int(row.get("sample_count", 0)),
                    "computed_at": now,
                }
            )
        self.logger.info(f"Transformed {len(records)} baseline records")
        return records


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════

_BASELINE_QUERY = text("""
    SELECT
        f.segment_key,
        f.time_key,
        d.day_of_week,
        AVG(f.current_speed_kmh)    AS avg_speed,
        AVG(f.delay_seconds)        AS avg_travel_time,
        COUNT(*)                    AS sample_count
    FROM fact_traffic_flow f
    JOIN dim_date d ON f.date_key = d.date_key
    WHERE f.date_key >= :since_date_key
    GROUP BY f.segment_key, f.time_key, d.day_of_week
""")


def run(engine: Engine, **kwargs) -> int:
    """Tính baseline speed từ dữ liệu lịch sử.

    Kwargs:
        since_date_key: int – chỉ tính từ ngày nào (default 30 ngày trước).

    Returns:
        int: Số baseline records tính được.
    """
    logger = get_logger("baseline_pipeline")

    from src.utils.math_calc import derive_date_key

    # Default: last 30 days
    since = kwargs.get("since_date_key", derive_date_key() - 100)  # YYYYMMDD - ~1 month

    from sqlalchemy.orm import Session

    with Session(engine) as session:
        result = session.execute(_BASELINE_QUERY, {"since_date_key": since})
        rows = [dict(r._mapping) for r in result]

    logger.info(f"Queried {len(rows)} aggregated baseline rows")

    if not rows:
        logger.warning("No historical data for baseline computation")
        return 0

    transformer = BaselineTransformer()
    records = transformer.transform(rows)

    # For now, return count (in Phase 2, can persist to a cache table)
    logger.info(f"Computed {len(records)} baseline entries")
    return len(records)
