"""Incident-flow cross update helpers.

SQL-first mapper that marks recent flow rows as incident-triggered based on
active Jam incidents near Quận 1 segment centers.
"""

from __future__ import annotations

from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from src.core.logger import get_logger


logger = get_logger(__name__)


def refresh_dim_segment_q1(engine: Engine, concurrently: bool = True) -> None:
    """Refresh materialized view dim_segment_q1.

    Use CONCURRENTLY when unique index exists and workload allows non-blocking refresh.
    """
    if concurrently:
        # Postgres requires REFRESH ... CONCURRENTLY to run outside a transaction block.
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                text("REFRESH MATERIALIZED VIEW CONCURRENTLY dim_segment_q1")
            )
        return

    with engine.connect() as conn:
        conn.execute(text("REFRESH MATERIALIZED VIEW dim_segment_q1"))
        conn.commit()


def mark_incident_triggered_flow(
    engine: Engine,
    *,
    lookback_hours: int = 2,
    distance_deg: float = 0.0002,
    icon_category: int = 6,
    time_tolerance_minutes: int = 30,
) -> int:
    """Cross-update fact_traffic_flow from recent incident proximity.

    Conditions:
    - Only recent flow rows (lookback_hours)
    - Only Quận 1 segments from dim_segment_q1
    - Incident type filtered by icon_category (default 6 = Jam)
    - Spatial condition: ST_DWithin(incident.geometry, segment.geometry_center, distance_deg)
    - Temporal alignment within time_tolerance_minutes around each flow timestamp
    """

    sql = text(
        """
        UPDATE fact_traffic_flow ft
        SET
            congestion_label = 'Kẹt do sự cố',
            is_incident_triggered = TRUE
        FROM dim_segment_q1 dsq1
        WHERE
            ft.segment_key = dsq1.segment_key
            AND ft.timestamp >= NOW() - make_interval(hours => :lookback_hours)
            AND EXISTS (
                SELECT 1
                FROM fact_incident fi
                WHERE
                    fi.icon_category = :icon_category
                    AND fi.geometry IS NOT NULL
                    AND fi.timestamp >= NOW() - make_interval(hours => :lookback_hours)
                    AND fi.timestamp BETWEEN
                        ft.timestamp - make_interval(mins => :time_tolerance_minutes)
                        AND ft.timestamp + make_interval(mins => :time_tolerance_minutes)
                    AND ST_DWithin(fi.geometry, dsq1.geometry_center, :distance_deg)
            )
            AND (
                ft.is_incident_triggered IS DISTINCT FROM TRUE
                OR ft.congestion_label IS DISTINCT FROM 'Kẹt do sự cố'
            )
        RETURNING ft.traffic_flow_key
        """
    )

    with Session(engine) as session:
        result = session.execute(
            sql,
            {
                "lookback_hours": int(lookback_hours),
                "distance_deg": float(distance_deg),
                "icon_category": int(icon_category),
                "time_tolerance_minutes": int(time_tolerance_minutes),
            },
        )
        updated = len(result.fetchall())
        session.commit()

    logger.info(
        "[incident-flow-mapper] updated=%d lookback_hours=%d distance_deg=%s icon_category=%d tolerance_min=%d",
        updated,
        lookback_hours,
        distance_deg,
        icon_category,
        time_tolerance_minutes,
    )
    return updated
