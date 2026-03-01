"""Data Pipeline CLI – Typer entrypoint.

Commands:
    run-static     Sinh + UPSERT dimension thời gian + ngày lễ
    run-spatial    Download OSM network + UPSERT spatial dims
    run-realtime   Weather → Traffic Flow → Incident (1 cycle)
    run-batch      Nightly: baseline + corridor performance
    run-all        Chạy tất cả theo thứ tự FK
    health         Kiểm tra kết nối Database
"""

from __future__ import annotations

from typing import Tuple

import typer
from sqlalchemy import Engine, text

from src.core.config import settings
from src.core.database import get_engine, health_check
from src.core.exceptions import PipelineError
from src.core.logger import get_logger

app = typer.Typer(
    name="data-pipeline",
    help="Traffic IoC – Data Pipeline ETL CLI",
    add_completion=False,
)

logger = get_logger("main")


# ═══════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════


@app.command()
def health() -> None:
    """Kiểm tra kết nối PostgreSQL."""
    ok = health_check()
    if ok:
        typer.echo("✅ Database connection OK")
        raise typer.Exit(code=0)
    else:
        typer.echo("❌ Database connection FAILED")
        raise typer.Exit(code=1)


@app.command("run-static")
def run_static() -> None:
    """Phase 1: Sinh + UPSERT dimension thời gian + ngày lễ.

    Thứ tự FK:
        dim_month_year → dim_shift → dim_date → dim_time_of_day
        → dim_holiday → bridge_date_holiday
    """
    engine = get_engine()
    total = 0

    # Date/Time dimensions
    try:
        from src.pipelines.static_dims.date_time_pipeline import run as run_dt

        count = run_dt(engine)
        logger.info(f"[run-static] date_time_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-static] date_time_pipeline failed: {e}")

    # Holidays
    try:
        from src.pipelines.static_dims.holiday_pipeline import run as run_hol

        count = run_hol(engine)
        logger.info(f"[run-static] holiday_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-static] holiday_pipeline failed: {e}")

    typer.echo(f"✅ run-static complete: {total} total records")


@app.command("run-spatial")
def run_spatial() -> None:
    """Phase 2: Download OSM network + UPSERT spatial dimensions.

    Thứ tự FK:
        dim_location → dim_node → dim_road → dim_way → dim_segment
    """
    engine = get_engine()
    total = 0

    # Location (wards catalog)
    try:
        from src.pipelines.spatial_net.location_pipeline import run as run_loc

        count = run_loc(engine)
        logger.info(f"[run-spatial] location_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-spatial] location_pipeline failed: {e}")

    # OSM road network
    try:
        from src.pipelines.spatial_net.osm_pipeline import run as run_osm

        count = run_osm(engine)
        logger.info(f"[run-spatial] osm_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-spatial] osm_pipeline failed: {e}")

    typer.echo(f"✅ run-spatial complete: {total} total records")


# ── Segment query helpers ─────────────────────────────────

_SEGMENT_QUERY = text("""
    SELECT s.segment_key,
           ST_Y(s.geometry_center) AS lat,
           ST_X(s.geometry_center) AS lon
    FROM   dim_segment s
    JOIN   dim_way w ON s.way_key = w.way_key
    WHERE  s.geometry_center IS NOT NULL
      AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    ORDER  BY s.length_m DESC
    LIMIT  :limit
""")

# Max segments per realtime cycle (TomTom free ≈ 2 500 calls/day,
# 96 cycles@15 min → ~25 per cycle).  Increase if paid plan.
_MAX_SEGMENTS_PER_CYCLE = 25


def _load_segment_points(
    engine: Engine,
    limit: int = _MAX_SEGMENTS_PER_CYCLE,
) -> Tuple[list, list, dict]:
    """Return (points, segment_keys, segment_key_map) from dim_segment.

    points : list[(lat, lon)]  → fed to TrafficExtractor
    segment_keys : list[int]   → index-based lookup in TrafficTransformer
    segment_key_map : {(lat,lon): segment_key}  → fallback coordinate lookup
    """
    points = []
    seg_keys: list[int] = []
    seg_map: dict[tuple, int] = {}
    with engine.connect() as conn:
        rows = conn.execute(_SEGMENT_QUERY, {"limit": limit}).fetchall()
    for seg_key, lat, lon in rows:
        pt = (round(lat, 6), round(lon, 6))
        points.append(pt)
        seg_keys.append(seg_key)
        seg_map[pt] = seg_key
    logger.info(f"[run-realtime] Loaded {len(points)} segment points from DB")
    return points, seg_keys, seg_map


@app.command("run-realtime")
def run_realtime() -> None:
    """Phase 3: Weather → Traffic Flow → Incident (1 cycle, cron 15p).

    Thứ tự:
        dim_weather (trả weather_key) → fact_traffic_flow → fact_incident
    """
    engine = get_engine()
    total = 0

    # Weather → trả weather_key (FK)
    weather_key = 800  # default
    try:
        from src.pipelines.real_time.weather_pipeline import run as run_weather

        weather_key = run_weather(engine)
        logger.info(f"[run-realtime] weather_pipeline: weather_key={weather_key}")
    except PipelineError as e:
        logger.error(f"[run-realtime] weather_pipeline failed: {e}")

    # Load segment coordinates from DB
    points, segment_keys, segment_key_map = _load_segment_points(engine)

    # Traffic Flow
    try:
        from src.pipelines.real_time.traffic_pipeline import run as run_traffic

        count = run_traffic(
            engine,
            weather_key=weather_key,
            points=points,
            segment_keys=segment_keys,
            segment_key_map=segment_key_map,
        )
        logger.info(f"[run-realtime] traffic_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-realtime] traffic_pipeline failed: {e}")

    # Incidents
    try:
        from src.pipelines.real_time.incident_pipeline import run as run_incident

        count = run_incident(engine)
        logger.info(f"[run-realtime] incident_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-realtime] incident_pipeline failed: {e}")

    typer.echo(f"✅ run-realtime complete: {total} total records")


@app.command("run-batch")
def run_batch() -> None:
    """Phase 4: Nightly batch – baseline speed + corridor performance."""
    engine = get_engine()
    total = 0

    try:
        from src.pipelines.ml_features.baseline_pipeline import run as run_base

        count = run_base(engine)
        logger.info(f"[run-batch] baseline_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-batch] baseline_pipeline failed: {e}")

    try:
        from src.pipelines.ml_features.corridor_pipeline import run as run_corr

        count = run_corr(engine)
        logger.info(f"[run-batch] corridor_pipeline: {count} records")
        total += count
    except PipelineError as e:
        logger.error(f"[run-batch] corridor_pipeline failed: {e}")

    typer.echo(f"✅ run-batch complete: {total} total records")


@app.command("run-all")
def run_all() -> None:
    """Chạy TẤT CẢ pipeline theo thứ tự FK.

    Phase 1 → Phase 2 → Phase 3 → Phase 4.
    """
    typer.echo("🚀 Starting full pipeline run...")

    run_static()
    run_spatial()
    run_realtime()
    run_batch()

    typer.echo("✅ All pipelines complete!")


# ═══════════════════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════════════════


if __name__ == "__main__":
    app()
