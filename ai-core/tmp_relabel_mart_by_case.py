from __future__ import annotations

from sqlalchemy import text

from src.core.database import get_engine

START_DATE = "2026-03-25"
END_DATE = "2026-04-16"


def main() -> None:
    engine = get_engine()

    update_sql = text(
        """
        UPDATE fact_forecast_segment_mart
        SET target_label = CASE
            WHEN traffic_index IS NULL THEN NULL
            WHEN traffic_index <= 0.10 THEN 0
            WHEN traffic_index <= 0.25 THEN 1
            WHEN traffic_index <= 0.42 THEN 2
            ELSE 3
        END
        WHERE timestamp >= :start_ts
          AND timestamp <= :end_ts
        """
    )

    count_sql = text(
        """
        SELECT target_label, COUNT(*) AS cnt
        FROM fact_forecast_segment_mart
        WHERE timestamp >= :start_ts
          AND timestamp <= :end_ts
        GROUP BY target_label
        ORDER BY target_label
        """
    )

    with engine.begin() as conn:
        result = conn.execute(update_sql, {"start_ts": START_DATE, "end_ts": END_DATE})
        rows = conn.execute(count_sql, {"start_ts": START_DATE, "end_ts": END_DATE}).fetchall()

    print(f"updated_rows={result.rowcount}")
    print("label_dist=", [(row[0], int(row[1])) for row in rows])


if __name__ == "__main__":
    main()
