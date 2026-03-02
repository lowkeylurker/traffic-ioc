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

import time
from typing import Tuple

import typer
from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table
from sqlalchemy import Engine, text

from src.core.config import settings
from src.core.database import get_engine, health_check
from src.core.exceptions import PipelineError
from src.core.logger import get_logger

# Rich console for formatted output
console = Console()

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
    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold yellow]📅 PHASE 1: STATIC DIMENSIONS[/bold yellow]\n"
        "[dim]Date/Time dimensions + Holidays[/dim]",
        border_style="yellow"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        # Date/Time dimensions
        task1 = progress.add_task("[cyan]Date/Time dimensions...", total=None)
        try:
            from src.pipelines.static_dims.date_time_pipeline import run as run_dt

            count = run_dt(engine)
            logger.info(f"[run-static] date_time_pipeline: {count} records")
            total += count
            results.append(("Date/Time Dimensions", count, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-static] date_time_pipeline failed: {e}")
            results.append(("Date/Time Dimensions", 0, "✗"))
            progress.update(task1, completed=True)

        # Holidays
        task2 = progress.add_task("[cyan]Holiday calendar...", total=None)
        try:
            from src.pipelines.static_dims.holiday_pipeline import run as run_hol

            count = run_hol(engine)
            logger.info(f"[run-static] holiday_pipeline: {count} records")
            total += count
            results.append(("Holiday Calendar", count, "✓"))
            progress.update(task2, completed=True)
        except PipelineError as e:
            logger.error(f"[run-static] holiday_pipeline failed: {e}")
            results.append(("Holiday Calendar", 0, "✗"))
            progress.update(task2, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 1 COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-spatial")
def run_spatial() -> None:
    """Phase 2: Download OSM network + UPSERT spatial dimensions + map segments to locations.

    Pipeline order:
    1. location_pipeline: Load 312 wards/communes with OSM boundaries
    2. osm_pipeline: Download road segments + nodes + ways
    3. segment_location_mapper: Spatial join ST_Contains(location.geometry, segment.center)
    4. corridor_pipeline: Load corridor definitions + bridges

    Thứ tự FK:
        dim_location → dim_node → dim_road → dim_way → dim_segment
        segment.location_key ← spatial join from locations
        dim_corridor + bridge_corridor_segment
    """
    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold green]🗺️  PHASE 2: SPATIAL NETWORK[/bold green]\n"
        "[dim]OSM Road Network + Corridors[/dim]",
        border_style="green"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        # Location (wards catalog)
        task1 = progress.add_task("[cyan]Location catalog...", total=None)
        try:
            from src.pipelines.spatial_net.location_pipeline import run as run_loc

            count = run_loc(engine)
            logger.info(f"[run-spatial] location_pipeline: {count} records")
            total += count
            results.append(("Location Catalog", count, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-spatial] location_pipeline failed: {e}")
            results.append(("Location Catalog", 0, "✗"))
            progress.update(task1, completed=True)

        # OSM road network
        task2 = progress.add_task("[cyan]OSM road network...", total=None)
        try:
            from src.pipelines.spatial_net.osm_pipeline import run as run_osm

            count = run_osm(engine)
            logger.info(f"[run-spatial] osm_pipeline: {count} records")
            total += count
            results.append(("OSM Road Network", count, "✓"))
            progress.update(task2, completed=True)
        except PipelineError as e:
            logger.error(f"[run-spatial] osm_pipeline failed: {e}")
            results.append(("OSM Road Network", 0, "✗"))
            progress.update(task2, completed=True)

        # Segment-Location spatial mapper
        task3 = progress.add_task("[cyan]Segment-location mapping...", total=None)
        try:
            from src.pipelines.spatial_net.segment_location_mapper import run as run_mapper

            count = run_mapper(engine)
            logger.info(f"[run-spatial] segment_location_mapper: {count} records")
            results.append(("Segment-Location Mapper", count, "✓"))
            progress.update(task3, completed=True)
        except Exception as e:
            logger.error(f"[run-spatial] segment_location_mapper failed: {e}")
            results.append(("Segment-Location Mapper", 0, "✗"))
            progress.update(task3, completed=True)

        # Corridor infrastructure
        task4 = progress.add_task("[cyan]Corridor infrastructure...", total=None)
        try:
            from src.pipelines.spatial_net.corridor_pipeline import run as run_corridor

            count = run_corridor(engine)
            logger.info(f"[run-spatial] corridor_pipeline: {count} records")
            total += count
            results.append(("Corridor Infrastructure", count, "✓"))
            progress.update(task4, completed=True)
        except PipelineError as e:
            logger.error(f"[run-spatial] corridor_pipeline failed: {e}")
            results.append(("Corridor Infrastructure", 0, "✗"))
            progress.update(task4, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 2 COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-corridors")
def run_corridors() -> None:
    """Load corridor infrastructure (dim_corridor + bridge_corridor_segment).
    
    Can be run standalone to (re)configure corridor definitions.
    """
    engine = get_engine()
    
    try:
        from src.pipelines.spatial_net.corridor_pipeline import run as run_corridor

        count = run_corridor(engine)
        logger.info(f"[run-corridors] corridor_pipeline: {count} records")
        typer.echo(f"✅ run-corridors complete: {count} total records")
    except PipelineError as e:
        logger.error(f"[run-corridors] corridor_pipeline failed: {e}")
        typer.echo(f"❌ run-corridors failed: {e}")
        raise typer.Exit(code=1)


@app.command("run-osm-district1")
def run_osm_district1() -> None:
    """Download OSM network for District 1 ONLY (fast, for testing/MVP).
    
    Uses BBOX_DISTRICT_1 (6km × 6km) instead of full HCM (70km × 61km).
    Much faster: ~20-30 seconds vs 2-3 minutes.
    """
    from src.domain.geo.constants import BBOX_DISTRICT_1
    
    engine = get_engine()
    
    console.print(Panel.fit(
        "[bold yellow]🗺️  OSM DISTRICT 1 ONLY[/bold yellow]\n"
        "[dim]Fast mode: 6km × 6km coverage[/dim]",
        border_style="yellow"
    ))
    
    try:
        from src.pipelines.spatial_net.osm_pipeline import run as run_osm

        count = run_osm(engine, bbox=BBOX_DISTRICT_1)
        logger.info(f"[run-osm-district1] osm_pipeline: {count} records")
        console.print(f"[green]✅ run-osm-district1 complete: {count} total records[/green]")
    except PipelineError as e:
        logger.error(f"[run-osm-district1] osm_pipeline failed: {e}")
        console.print(f"[red]❌ run-osm-district1 failed: {e}[/red]")
        raise typer.Exit(code=1)


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
    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold cyan]🌤️  PHASE 3: REAL-TIME DATA[/bold cyan]\n"
        "[dim]Weather + Traffic Flow + Incidents[/dim]",
        border_style="cyan"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        # Weather → trả weather_key (FK)
        weather_key = 800  # default
        task1 = progress.add_task("[cyan]Current weather...", total=None)
        try:
            from src.pipelines.real_time.weather_pipeline import run as run_weather

            weather_key = run_weather(engine)
            logger.info(f"[run-realtime] weather_pipeline: weather_key={weather_key}")
            results.append(("Weather Data", 1, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime] weather_pipeline failed: {e}")
            results.append(("Weather Data", 0, "✗"))
            progress.update(task1, completed=True)

        # Load segment coordinates from DB
        task2 = progress.add_task("[cyan]Loading segment points...", total=None)
        points, segment_keys, segment_key_map = _load_segment_points(engine)
        progress.update(task2, completed=True)

        # Traffic Flow
        task3 = progress.add_task("[cyan]Traffic flow data...", total=None)
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
            results.append(("Traffic Flow", count, "✓"))
            progress.update(task3, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime] traffic_pipeline failed: {e}")
            results.append(("Traffic Flow", 0, "✗"))
            progress.update(task3, completed=True)

        # Incidents
        task4 = progress.add_task("[cyan]Traffic incidents...", total=None)
        try:
            from src.pipelines.real_time.incident_pipeline import run as run_incident

            count = run_incident(engine)
            logger.info(f"[run-realtime] incident_pipeline: {count} records")
            total += count
            results.append(("Traffic Incidents", count, "✓"))
            progress.update(task4, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime] incident_pipeline failed: {e}")
            results.append(("Traffic Incidents", 0, "✗"))
            progress.update(task4, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 3 COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-batch")
def run_batch() -> None:
    """Phase 4: Nightly batch – baseline speed + corridor performance."""
    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold magenta]📊 PHASE 4: BATCH ANALYTICS[/bold magenta]\n"
        "[dim]Baseline Speed + Corridor Performance[/dim]",
        border_style="magenta"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        # Baseline speed
        task1 = progress.add_task("[cyan]Baseline speed calculation...", total=None)
        try:
            from src.pipelines.ml_features.baseline_pipeline import run as run_base

            count = run_base(engine)
            logger.info(f"[run-batch] baseline_pipeline: {count} records")
            total += count
            results.append(("Baseline Speed", count, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-batch] baseline_pipeline failed: {e}")
            results.append(("Baseline Speed", 0, "✗"))
            progress.update(task1, completed=True)

        # Corridor performance
        task2 = progress.add_task("[cyan]Corridor performance...", total=None)
        try:
            from src.pipelines.ml_features.corridor_pipeline import run as run_corr

            count = run_corr(engine)
            logger.info(f"[run-batch] corridor_pipeline: {count} records")
            total += count
            results.append(("Corridor Performance", count, "✓"))
            progress.update(task2, completed=True)
        except PipelineError as e:
            logger.error(f"[run-batch] corridor_pipeline failed: {e}")
            results.append(("Corridor Performance", 0, "✗"))
            progress.update(task2, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 4 COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-all")
def run_all() -> None:
    """Chạy TẤT CẢ pipeline theo thứ tự FK.

    Phase 1 → Phase 2 → Phase 3 → Phase 4.
    """
    overall_start = time.time()
    
    console.print("\n" + "═" * 80)
    console.print(Panel.fit(
        "[bold white]🚀 FULL PIPELINE EXECUTION[/bold white]\n"
        "[dim]Phase 1 → Phase 2 → Phase 3 → Phase 4[/dim]",
        border_style="bold white"
    ))
    console.print("═" * 80 + "\n")

    run_static()
    run_spatial()
    run_realtime()
    run_batch()

    overall_elapsed = time.time() - overall_start
    
    console.print("\n" + "═" * 80)
    console.print(Panel.fit(
        f"[bold green]✅ ALL PIPELINES COMPLETE![/bold green]\n"
        f"[dim]Total execution time: {overall_elapsed:.2f}s ({overall_elapsed/60:.1f} minutes)[/dim]",
        border_style="bold green"
    ))
    console.print("═" * 80 + "\n")


# ═══════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════


def _print_phase_summary(
    title: str,
    results: list[tuple[str, int, str]],
    total: int,
    elapsed: float,
) -> None:
    """Print phase summary table.
    
    Args:
        title: Phase title
        results: List of (pipeline_name, count, status) tuples
        total: Total records processed
        elapsed: Execution time in seconds
    """
    table = Table(title=title, show_header=True, header_style="bold cyan")
    table.add_column("Pipeline", style="cyan", width=30)
    table.add_column("Records", justify="right", style="green", width=15)
    table.add_column("Status", justify="center", style="yellow", width=10)
    
    for pipeline_name, count, status in results:
        status_icon = "[green]✓[/green]" if status == "✓" else "[red]✗[/red]"
        table.add_row(pipeline_name, f"{count:,}", status_icon)
    
    table.add_row("─" * 30, "─" * 15, "─" * 10)
    table.add_row(
        "[bold]TOTAL[/bold]",
        f"[bold]{total:,}[/bold]",
        f"[bold]{elapsed:.2f}s[/bold]"
    )
    
    console.print(table)
    console.print("")


# ═══════════════════════════════════════════════════════════
# ENTRYPOINT
# ═══════════════════════════════════════════════════════════


if __name__ == "__main__":
    app()
