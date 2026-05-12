from __future__ import annotations

from sqlalchemy import text

from src.core.database import get_engine
from src.data_access.forecast_mart_repository import _refresh_forecast_mart_for_segments
from src.data_access.warehouse_repository import get_segments_in_corridor

CORRIDOR_IDS = [
    136550177913819656,
    392537437542429252,
    646713380690000556,
    647577676530405923,
    988709510142577156,
    1100735735503891924,
]
START_DATE = "2026-03-25"
END_DATE = "2026-04-16"


def main() -> None:
    segment_ids = sorted({seg for corridor in CORRIDOR_IDS for seg in get_segments_in_corridor(corridor)})
    print(f"segments={len(segment_ids)}")

    engine = get_engine()
    refreshed = _refresh_forecast_mart_for_segments(engine, segment_ids, START_DATE, END_DATE)
    print(f"refresh_ok={refreshed}")

    query = text(
        """
        SELECT target_label, COUNT(*) AS cnt
        FROM fact_forecast_segment_mart
        WHERE segment_key = ANY(:seg_ids)
          AND timestamp >= :start_ts
          AND timestamp <= :end_ts
        GROUP BY target_label
        ORDER BY target_label
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(
            query,
            {
                "seg_ids": segment_ids,
                "start_ts": START_DATE,
                "end_ts": END_DATE,
            },
        ).fetchall()

    print("label_dist=", [(row[0], int(row[1])) for row in rows])


if __name__ == "__main__":
    main()
