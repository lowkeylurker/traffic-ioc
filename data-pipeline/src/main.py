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

import typer

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

    # Traffic Flow
    try:
        from src.pipelines.real_time.traffic_pipeline import run as run_traffic

        count = run_traffic(engine, weather_key=weather_key)
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
