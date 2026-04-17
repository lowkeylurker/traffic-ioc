from __future__ import annotations

from sqlalchemy import text

from src.core.database import get_engine

START_DATE = "2026-03-25"
END_DATE = "2026-04-16"
BATCH_SIZE = 20000


def main() -> None:
    engine = get_engine()

    kill_sql = text(
        """
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state <> 'idle'
          AND (
            query ILIKE '%tmp_relabel_mart_by_case%'
            OR query ILIKE '%fact_forecast_segment_mart%UPDATE%'
          )
        """
    )

    batch_sql = text(
        """
        WITH batch AS (
            SELECT ctid
            FROM fact_forecast_segment_mart
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND target_label IS DISTINCT FROM (
                CASE
                    WHEN traffic_index IS NULL THEN NULL
                    WHEN traffic_index <= 0.10 THEN 0
                    WHEN traffic_index <= 0.25 THEN 1
                    WHEN traffic_index <= 0.42 THEN 2
                    ELSE 3
                END
              )
            LIMIT :batch_size
            FOR UPDATE SKIP LOCKED
        )
        UPDATE fact_forecast_segment_mart AS t
        SET target_label = CASE
            WHEN t.traffic_index IS NULL THEN NULL
            WHEN t.traffic_index <= 0.10 THEN 0
            WHEN t.traffic_index <= 0.25 THEN 1
            WHEN t.traffic_index <= 0.42 THEN 2
            ELSE 3
        END
        FROM batch
        WHERE t.ctid = batch.ctid
        """
    )

    dist_sql = text(
        """
        SELECT target_label, COUNT(*) AS cnt
        FROM fact_forecast_segment_mart
        WHERE timestamp >= :start_ts
          AND timestamp <= :end_ts
        GROUP BY target_label
        ORDER BY target_label
        """
    )

    params = {
        "start_ts": START_DATE,
        "end_ts": END_DATE,
        "batch_size": BATCH_SIZE,
    }

    with engine.begin() as conn:
        conn.execute(kill_sql)

    total_updated = 0
    while True:
        with engine.begin() as conn:
            result = conn.execute(batch_sql, params)
            updated = int(result.rowcount or 0)
        total_updated += updated
        if updated == 0:
            break

    with engine.connect() as conn:
        rows = conn.execute(dist_sql, {"start_ts": START_DATE, "end_ts": END_DATE}).fetchall()

    print(f"total_updated_rows={total_updated}")
    print("label_dist=", [(row[0], int(row[1])) for row in rows])


if __name__ == "__main__":
    main()
