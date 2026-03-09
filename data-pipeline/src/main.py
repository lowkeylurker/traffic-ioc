"""Data Pipeline CLI – Typer entrypoint.

Commands:
    run-static     Sinh + UPSERT dimension thời gian + ngày lễ
    run-spatial    Download OSM network + UPSERT spatial dims
    run-realtime   Weather → Traffic Flow → Incident (Quận 1 corridors)
    run-batch      Nightly: baseline (all) + corridor performance (Quận 1)
    run-all        Chạy tất cả theo thứ tự FK
    health         Kiểm tra kết nối Database
    
Note: As of Mar 2026, realtime and batch ETL officially target Quận 1 corridors only.
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
"""Data Pipeline CLI – Typer entrypoint.

Commands:
    run-static                     Sinh + UPSERT dimension thời gian + ngày lễ
    run-spatial                    Download OSM network + UPSERT spatial dims
    run-osm-district1              Download OSM for District 1 only (fast, MVP)
    run-osm-central-districts      Download OSM for central districts (expanded)
    run-realtime                   Weather → Traffic Flow → Incident (Quận 1 only) [OFFICIAL]
    run-realtime-central-districts Weather → Traffic Flow → Incident (central districts)
    run-batch                      Nightly: baseline (all) + corridor perf (Quận 1) [OFFICIAL]
    run-corridor-central-districts Corridor performance for Quận 1 (alias for run-batch corridor step)
    run-all                        Chạy tất cả theo thứ tự FK
    health                         Kiểm tra kết nối Database

As of Mar 2026: Official production ETL targets Quận 1 corridors only (~920 segments).
Central Districts (legacy): Quận 1, 3, 4, 5, Bình Thạnh, Phú Nhuận, 10, 11
"""
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
def run_spatial(
    skip_location: bool = typer.Option(False, help="Skip location catalog step"),
    skip_osm: bool = typer.Option(False, help="Skip OSM road network step"),
    skip_mapper: bool = typer.Option(False, help="Skip segment-location mapper step"),
    skip_corridor: bool = typer.Option(False, help="Skip corridor infrastructure step"),
    force_location_refresh: bool = typer.Option(
        False,
        help="Force refresh dim_location even when catalog already complete",
    ),
) -> None:
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
    skip_location = bool(_resolve_option_default(skip_location))
    skip_osm = bool(_resolve_option_default(skip_osm))
    skip_mapper = bool(_resolve_option_default(skip_mapper))
    skip_corridor = bool(_resolve_option_default(skip_corridor))
    force_location_refresh = bool(_resolve_option_default(force_location_refresh))
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
        if skip_location:
            results.append(("Location Catalog", 0, "✓"))
            progress.update(task1, completed=True)
        else:
            try:
                from src.pipelines.spatial_net.location_pipeline import run as run_loc

                count = run_loc(engine, force_refresh=force_location_refresh)
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
        if skip_osm:
            results.append(("OSM Road Network", 0, "✓"))
            progress.update(task2, completed=True)
        else:
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
        if skip_mapper:
            results.append(("Segment-Location Mapper", 0, "✓"))
            progress.update(task3, completed=True)
        else:
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
        if skip_corridor:
            results.append(("Corridor Infrastructure", 0, "✓"))
            progress.update(task4, completed=True)
        else:
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


@app.command("run-location")
def run_location(
    force_refresh: bool = typer.Option(
        False,
        help="Force refresh dim_location even when catalog already complete",
    ),
) -> None:
    """Load dim_location only (useful for quick recovery after spatial failures)."""
    engine = get_engine()
    force_refresh = bool(_resolve_option_default(force_refresh))

    try:
        from src.pipelines.spatial_net.location_pipeline import run as run_loc

        count = run_loc(engine, force_refresh=force_refresh)
        logger.info(f"[run-location] location_pipeline: {count} records")
        typer.echo(f"✅ run-location complete: {count} records")
    except Exception as e:
        logger.error(f"[run-location] location_pipeline failed: {e}")
        typer.echo(f"❌ run-location failed: {e}")
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


@app.command("run-osm-central-districts")
def run_osm_central_districts() -> None:
    """Download OSM network for CENTRAL DISTRICTS (Quận 1, 3, 4, 5, Bình Thạnh, Phú Nhuận, 10, 11).

    Uses BBOX_CENTRAL_DISTRICTS (~22km × 17km) - Expanded coverage area.
    Moderate speed: ~60-90 seconds for central districts.
    """
    from src.domain.geo.constants import BBOX_CENTRAL_DISTRICTS

    engine = get_engine()

    console.print(Panel.fit(
        "[bold yellow]🗺️  OSM CENTRAL DISTRICTS[/bold yellow]\n"
        "[dim]Coverage: Quận 1, 3, 4, 5, Bình Thạnh, Phú Nhuận, 10, 11[/dim]",
        border_style="yellow"
    ))

    try:
        from src.pipelines.spatial_net.osm_pipeline import run as run_osm

        count = run_osm(engine, bbox=BBOX_CENTRAL_DISTRICTS)
        logger.info(f"[run-osm-central-districts] osm_pipeline: {count} records")
        console.print(f"[green]✅ run-osm-central-districts complete: {count} total records[/green]")
    except PipelineError as e:
        logger.error(f"[run-osm-central-districts] osm_pipeline failed: {e}")
        console.print(f"[red]❌ run-osm-central-districts failed: {e}[/red]")
        raise typer.Exit(code=1)


# ── Segment query helpers ─────────────────────────────────

_SEGMENT_QUERY = text("""
    SELECT s.segment_key,
           ST_Y(s.geometry_center) AS lat,
        ST_X(s.geometry_center) AS lon,
        COALESCE(w.default_lane_count, 2) AS lane_count
    FROM   dim_segment s
    JOIN   dim_way w ON s.way_key = w.way_key
    WHERE  s.geometry_center IS NOT NULL
      AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    ORDER  BY s.length_m DESC
    LIMIT  :limit
""")

_SEGMENT_QUERY_WITH_BBOX = text("""
        SELECT s.segment_key,
                     ST_Y(s.geometry_center) AS lat,
                ST_X(s.geometry_center) AS lon,
                COALESCE(w.default_lane_count, 2) AS lane_count
        FROM   dim_segment s
        JOIN   dim_way w ON s.way_key = w.way_key
        WHERE  s.geometry_center IS NOT NULL
            AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
            AND  ST_Y(s.geometry_center) >= :min_lat
            AND  ST_Y(s.geometry_center) <= :max_lat
            AND  ST_X(s.geometry_center) >= :min_lon
            AND  ST_X(s.geometry_center) <= :max_lon
        ORDER  BY s.length_m DESC
        LIMIT  :limit
""")

_SEGMENT_QUERY_BY_TARGET_CORRIDORS = text("""
        WITH q1_boundary AS (
                SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
                FROM dim_location dl
                WHERE dl.geometry_polygon IS NOT NULL
                    AND (
                                LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
                         OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
                         OR LOWER(TRIM(dl.district)) LIKE '%district 1%'
                    )
        ),
        all_corridor_segments AS (
                -- Count total segments for each corridor
                SELECT bcs.corridor_key,
                       COUNT(*) AS total_segments,
                       SUM(ds.length_m) AS total_length_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                WHERE ds.geometry_center IS NOT NULL
                GROUP BY bcs.corridor_key
        ),
        q1_corridor_segments AS (
                -- Count segments within Q1 for each corridor
                SELECT bcs.corridor_key,
                       COUNT(*) AS q1_segments,
                       SUM(ds.length_m) AS q1_length_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                CROSS JOIN q1_boundary qb
                WHERE ds.geometry_center IS NOT NULL
                    AND (
                                (qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
                         OR (
                                        qb.geom IS NULL
                                AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                                AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                         )
                    )
                GROUP BY bcs.corridor_key
        ),
        target_corridors AS (
                -- Filter corridors by coverage threshold (≥50% of segments OR length in Q1)
                SELECT acs.corridor_key
                FROM all_corridor_segments acs
                JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
                WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
                   OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
        )
    SELECT DISTINCT
           s.segment_key,
           ST_Y(s.geometry_center) AS lat,
           ST_X(s.geometry_center) AS lon,
           COALESCE(w.default_lane_count, 2) AS lane_count
    FROM   dim_segment s
    JOIN   dim_way w ON s.way_key = w.way_key
    JOIN   bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN   target_corridors tc ON tc.corridor_key = bcs.corridor_key
    WHERE  s.geometry_center IS NOT NULL
      AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    ORDER  BY s.segment_key
    LIMIT  :limit
""")

# Max segments per realtime cycle (TomTom free ≈ 2 500 calls/day,
# 96 cycles@15 min → ~25 per cycle).  Increase if paid plan.
_MAX_SEGMENTS_PER_CYCLE = 25
_OVERFETCH_FACTOR = 3

# For target corridor mode (Q1 only): fetch all segments (920 as of Mar 2026)
# Use this for batch ETL or when you want complete coverage
_MAX_SEGMENTS_TARGET_CORRIDORS = 1000


def _resolve_option_default(value):
    """Return concrete value when receiving Typer OptionInfo defaults."""
    return getattr(value, "default", value)


def _load_segment_points(
    engine: Engine,
    limit: int = _MAX_SEGMENTS_PER_CYCLE,
    bbox: dict | None = None,
    target_corridor_mode: bool = False,
    overfetch_factor: int = _OVERFETCH_FACTOR,
) -> Tuple[list, list, dict, dict]:
    """Return (points, segment_keys, segment_key_map, lane_count_map) from dim_segment.

    points : list[(lat, lon)]  → fed to TrafficExtractor
    segment_keys : list[int]   → index-based lookup in TrafficTransformer
    segment_key_map : {(lat,lon): segment_key}  → fallback coordinate lookup
    lane_count_map : {segment_key: lane_count} → PCU estimation enrichment
    
    Args:
        engine: SQLAlchemy Engine
        limit: Max segments to load (default 25 for TomTom free tier)
        bbox: Optional bounding box dict {min_lon, max_lon, min_lat, max_lat} to filter segments
        target_corridor_mode: If True, use corridor-based filtering with BBOX_TARGET_DISTRICT (Q1 only)
        overfetch_factor: Fetch extra candidates to compensate invalid/duplicate points
    """
    points = []
    seg_keys: list[int] = []
    seg_map: dict[tuple, int] = {}
    lane_count_map: dict[int, int] = {}
    
    # Ensure limit is int (Typer OptionInfo → int when called from run_all)
    limit = int(_resolve_option_default(limit)) if not isinstance(limit, int) else limit
    
    # For target corridors mode: use higher limit to capture all segments
    if target_corridor_mode:
        from src.domain.geo.constants import BBOX_TARGET_DISTRICT
        # Q1 has ~920 segments, use generous limit
        effective_limit = max(limit, _MAX_SEGMENTS_TARGET_CORRIDORS)
        query_limit = effective_limit  # No overfetch factor needed, we want all
        target_bbox = BBOX_TARGET_DISTRICT
    else:
        query_limit = max(limit, int(limit * max(1, overfetch_factor)))
        target_bbox = None

    with engine.connect() as conn:
        if target_corridor_mode:
            params = {
                "limit": query_limit,
                "min_lon": target_bbox["min_lon"],
                "max_lon": target_bbox["max_lon"],
                "min_lat": target_bbox["min_lat"],
                "max_lat": target_bbox["max_lat"],
            }
            rows = conn.execute(_SEGMENT_QUERY_BY_TARGET_CORRIDORS, params).fetchall()
        elif bbox:
            # Use query with bbox filter for central districts
            params = {
                "limit": query_limit,
                "min_lon": bbox.get("min_lon", 106.4),
                "max_lon": bbox.get("max_lon", 107.1),
                "min_lat": bbox.get("min_lat", 10.4),
                "max_lat": bbox.get("max_lat", 10.95),
            }
            rows = conn.execute(_SEGMENT_QUERY_WITH_BBOX, params).fetchall()
        else:
            # Use original query without bbox filter
            rows = conn.execute(_SEGMENT_QUERY, {"limit": query_limit}).fetchall()
    
    seen_points: set[tuple[float, float]] = set()
    seen_segment_keys: set[int] = set()
    duplicate_count = 0
    for seg_key, lat, lon, lane_count in rows:
        if int(seg_key) in seen_segment_keys:
            duplicate_count += 1
            continue

        pt = (round(lat, 6), round(lon, 6))
        if pt in seen_points:
            duplicate_count += 1
            continue

        seen_segment_keys.add(int(seg_key))
        seen_points.add(pt)

        points.append(pt)
        seg_keys.append(seg_key)
        seg_map[pt] = seg_key
        lane_count_map[int(seg_key)] = max(1, int(lane_count or 2))

        # For target corridors, use effective_limit; otherwise use original limit
        actual_limit = effective_limit if target_corridor_mode else limit
        if len(points) >= actual_limit:
            break
    
    mode_label = "target_corridors_Q1" if target_corridor_mode else (f"bbox: {bbox}" if bbox else "all")
    logger.info(
        f"[run-realtime] Loaded {len(points)} segment points from DB ({mode_label}) "
        f"(query_limit={query_limit}, duplicates_skipped={duplicate_count})"
    )
    return points, seg_keys, seg_map, lane_count_map


@app.command("run-realtime")
def run_realtime(
    segment_limit: int = typer.Option(
        _MAX_SEGMENTS_TARGET_CORRIDORS,
        min=1,
        max=2000,
        help="Max number of segment points queried per realtime cycle",
    ),
) -> None:
    """Phase 3: Weather → Traffic Flow → Incident (1 cycle, cron 15p).

    **OFFICIAL Q1 MODE**: Uses target_corridor_mode for Quận 1 corridors only.
    
    Thứ tự:
        dim_weather (trả weather_key) → fact_traffic_flow → fact_incident
    """
    start_time = time.time()
    engine = get_engine()
    segment_limit = int(_resolve_option_default(segment_limit))
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold cyan]🌤️  PHASE 3: REAL-TIME DATA (DISTRICT 1)[/bold cyan]\n"
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

        # Load segment coordinates from DB (Q1 target corridors only)
        task2 = progress.add_task("[cyan]Loading Q1 segment points...", total=None)
        points, segment_keys, segment_key_map, lane_count_map = _load_segment_points(
            engine,
            limit=segment_limit,
            target_corridor_mode=True,
        )
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
                lane_count_map=lane_count_map,
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


@app.command("run-realtime-central-districts")
def run_realtime_central_districts(
    segment_limit: int = typer.Option(
        _MAX_SEGMENTS_TARGET_CORRIDORS,
        min=1,
        max=2000,
        help="Max number of segment points queried per realtime cycle for central districts (default: 1000 for full corridor coverage)",
    ),
) -> None:
    """Phase 3 - Extended: Weather → Traffic Flow → Incident for DISTRICT 1.

    Coverage: Quận 1 only (ALL segments belonging to corridors in Q1, ~920 segments as of Mar 2026)

    Thứ tự:
        dim_weather (trả weather_key) → fact_traffic_flow → fact_incident
    """
    from src.domain.geo.constants import BBOX_TARGET_DISTRICT

    start_time = time.time()
    engine = get_engine()
    segment_limit = int(_resolve_option_default(segment_limit))
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold cyan]🌤️  PHASE 3 - DISTRICT 1[/bold cyan]\n"
        "[dim]Weather + Traffic Flow + Incidents (Quận 1 only)[/dim]",
        border_style="cyan"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        weather_key = 800
        task1 = progress.add_task("[cyan]Current weather...", total=None)
        try:
            from src.pipelines.real_time.weather_pipeline import run as run_weather

            weather_key = run_weather(engine)
            logger.info(f"[run-realtime-central-districts] weather_pipeline: weather_key={weather_key}")
            results.append(("Weather Data", 1, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime-central-districts] weather_pipeline failed: {e}")
            results.append(("Weather Data", 0, "✗"))
            progress.update(task1, completed=True)

        task2 = progress.add_task("[cyan]Loading segment points (Q1 corridors)...", total=None)
        points, segment_keys, segment_key_map, lane_count_map = _load_segment_points(
            engine,
            limit=segment_limit,
            target_corridor_mode=True,
        )
        progress.update(task2, completed=True)

        task3 = progress.add_task("[cyan]Traffic flow data (Q1)...", total=None)
        try:
            from src.pipelines.real_time.traffic_pipeline import run as run_traffic

            count = run_traffic(
                engine,
                weather_key=weather_key,
                points=points,
                segment_keys=segment_keys,
                segment_key_map=segment_key_map,
                lane_count_map=lane_count_map,
            )
            logger.info(f"[run-realtime-central-districts] traffic_pipeline: {count} records")
            total += count
            results.append(("Traffic Flow", count, "✓"))
            progress.update(task3, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime-central-districts] traffic_pipeline failed: {e}")
            results.append(("Traffic Flow", 0, "✗"))
            progress.update(task3, completed=True)

        task4 = progress.add_task("[cyan]Traffic incidents (Q1)...", total=None)
        try:
            from src.pipelines.real_time.incident_pipeline import run as run_incident

            count = run_incident(engine, bbox=BBOX_TARGET_DISTRICT)
            logger.info(f"[run-realtime-central-districts] incident_pipeline: {count} records")
            total += count
            results.append(("Traffic Incidents", count, "✓"))
            progress.update(task4, completed=True)
        except PipelineError as e:
            logger.error(f"[run-realtime-central-districts] incident_pipeline failed: {e}")
            results.append(("Traffic Incidents", 0, "✗"))
            progress.update(task4, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 3 EXTENDED COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-batch")
def run_batch() -> None:
    """Phase 4: Nightly batch – baseline speed + corridor performance.
    
    **OFFICIAL Q1 MODE**: Corridor performance uses Quận 1 filtering.
    """
    from src.domain.geo.constants import BBOX_TARGET_DISTRICT
    
    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold magenta]📊 PHASE 4: BATCH ANALYTICS (DISTRICT 1)[/bold magenta]\n"
        "[dim]Baseline Speed (All) + Corridor Performance (Q1)[/dim]",
        border_style="magenta"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        # Baseline speed (all segments)
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

        # Corridor performance (Q1 only)
        task2 = progress.add_task("[cyan]Corridor performance (Q1)...", total=None)
        try:
            from src.pipelines.ml_features.corridor_pipeline import run as run_corr

            count = run_corr(engine, bbox=BBOX_TARGET_DISTRICT)
            logger.info(f"[run-batch] corridor_pipeline (Q1): {count} records")
            total += count
            results.append(("Corridor Performance (Q1)", count, "✓"))
            progress.update(task2, completed=True)
        except PipelineError as e:
            logger.error(f"[run-batch] corridor_pipeline failed: {e}")
            results.append(("Corridor Performance (Q1)", 0, "✗"))
            progress.update(task2, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("PHASE 4 COMPLETE", results, total, elapsed)
    typer.echo("")


@app.command("run-corridor-central-districts")
def run_corridor_central_districts() -> None:
    """Calculate corridor performance for Quận 1 only.

    This aggregates target corridors from fact_traffic_flow.
    """
    from src.domain.geo.constants import BBOX_TARGET_DISTRICT

    start_time = time.time()
    engine = get_engine()
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold magenta]📊 CORRIDOR PERFORMANCE - DISTRICT 1[/bold magenta]\n"
        "[dim]Quận 1 only[/dim]",
        border_style="magenta"
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task1 = progress.add_task("[cyan]Corridor performance (Q1)...", total=None)
        try:
            from src.pipelines.ml_features.corridor_pipeline import run as run_corr

            count = run_corr(engine, bbox=BBOX_TARGET_DISTRICT)
            logger.info(f"[run-corridor-central-districts] corridor_pipeline: {count} records")
            total += count
            results.append(("Corridor Performance", count, "✓"))
            progress.update(task1, completed=True)
        except PipelineError as e:
            logger.error(f"[run-corridor-central-districts] corridor_pipeline failed: {e}")
            results.append(("Corridor Performance", 0, "✗"))
            progress.update(task1, completed=True)

    elapsed = time.time() - start_time
    _print_phase_summary("CORRIDOR PERFORMANCE COMPLETE", results, total, elapsed)
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
    run_realtime_central_districts()
    run_corridor_central_districts()

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
