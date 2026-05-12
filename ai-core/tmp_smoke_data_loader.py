from sqlalchemy import text

from src.core.database import get_engine
from src.utils.data_loader import load_bulk_segment_data


def main() -> None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT segment_key, MIN(timestamp) AS min_ts, MAX(timestamp) AS max_ts, COUNT(*) AS row_count
                FROM fact_traffic_flow
                GROUP BY segment_key
                ORDER BY row_count DESC
                LIMIT 1
                """
            )
        ).mappings().first()

    if row is None:
        raise SystemExit("No segment found in fact_traffic_flow")

    segment_id = int(row["segment_key"])
    start_date = row["min_ts"].strftime("%Y-%m-%d %H:%M:%S")
    end_date = row["max_ts"].strftime("%Y-%m-%d %H:%M:%S")

    print(
        f"SMOKE_TEST segment_id={segment_id} row_count={row['row_count']} "
        f"start={start_date} end={end_date}"
    )

    result = load_bulk_segment_data(
        [segment_id],
        start_date=start_date,
        end_date=end_date,
        peak_hours_only=True,
    )

    print(f"SMOKE_TEST processed_segments={len(result)}")
    df = result.get(segment_id)
    print(f"SMOKE_TEST target_shape={None if df is None else df.shape}")

    if df is not None:
        print(f"SMOKE_TEST columns={list(df.columns)}")
        print(df.head(3).to_string(index=False))
    else:
        print("SMOKE_TEST missing segment")


if __name__ == "__main__":
    main()
