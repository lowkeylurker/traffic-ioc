"""Data Pipeline CLI – Typer entrypoint.

Commands:
    run-static     Sinh + UPSERT dimension thời gian + ngày lễ
    run-spatial    Download OSM network + UPSERT spatial dims
    run-realtime   Weather → Traffic Flow → Incident (priority corridors, critical segments)
    run-batch      Nightly: baseline (all) + corridor performance (priority corridors)
    run-all        Chạy tất cả theo thứ tự FK
    health         Kiểm tra kết nối Database
    
Note: As of Mar 2026, realtime ETL selects critical segments from priority corridors
under request budget constraints.
"""

from __future__ import annotations

from collections import defaultdict
from math import ceil
import time
import os
from typing import Tuple

import requests
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
    run-cycle                      One-shot cycle: run-realtime → run-batch
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


@app.command("health-tomtom-keys")
def health_tomtom_keys(
    timeout_sec: int = typer.Option(
        8,
        min=3,
        max=30,
        help="HTTP timeout per key probe (seconds)",
    ),
) -> None:
    """Daily TomTom key health check.

    Reports:
      - usable_keys
      - blocked_keys
      - effective_budget/cycle (req)
      - safe_traffic_segment_limit/cycle
    """

    keys = settings.get_tomtom_keys()
    if not keys:
        typer.echo("❌ No TomTom keys configured (TOMTOM_API_KEYS / TOMTOM_API_KEY)")
        raise typer.Exit(code=1)

    base_url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
    probe_params = {
        "point": "10.7764,106.7011",
        "unit": "KMPH",
    }

    rows: list[tuple[str, str, str]] = []
    usable = 0
    blocked = 0

    for key in keys:
        masked = f"...{key[-8:]}"
        params = dict(probe_params)
        params["key"] = key
        try:
            r = requests.get(base_url, params=params, timeout=timeout_sec)
            if r.status_code == 200:
                usable += 1
                rows.append((masked, "usable", "HTTP 200"))
            elif r.status_code == 403:
                blocked += 1
                detail = "HTTP 403 (Forbidden / entitlement / quota)"
                rows.append((masked, "blocked", detail))
            else:
                blocked += 1
                rows.append((masked, "blocked", f"HTTP {r.status_code}"))
        except requests.RequestException as e:
            blocked += 1
            rows.append((masked, "blocked", f"network error: {e.__class__.__name__}"))

    cycles_per_day = 34
    daily_limit = int(settings.tomtom_daily_limit_per_key or 2500)
    reserve = int(os.getenv("NON_TRAFFIC_REQ_RESERVE", "3"))
    headroom = float(os.getenv("TRAFFIC_REQ_HEADROOM_PCT", "0.10"))
    effective_budget_per_cycle = (usable * daily_limit) // cycles_per_day
    safe_traffic_limit = max(
        1,
        int(max(1, effective_budget_per_cycle - reserve) * (1.0 - headroom)),
    )

    console.print(Panel.fit(
        "[bold cyan]🔎 TOMTOM KEY HEALTH CHECK[/bold cyan]\n"
        "[dim]Probe endpoint: traffic flow absolute/10/json[/dim]",
        border_style="cyan",
    ))

    table = Table(show_header=True, header_style="bold cyan")
    table.add_column("Key", style="magenta", width=14)
    table.add_column("Status", style="green", width=10)
    table.add_column("Detail", style="dim", width=48)
    for masked, status, detail in rows:
        color = "green" if status == "usable" else "red"
        table.add_row(masked, f"[{color}]{status}[/{color}]", detail)
    console.print(table)

    console.print(
        f"usable_keys={usable} | blocked_keys={blocked} | "
        f"effective_budget/cycle={effective_budget_per_cycle} req | "
        f"safe_traffic_segment_limit/cycle={safe_traffic_limit}"
    )

    if usable == 0:
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
        WITH active_corridors AS (
            SELECT c.corridor_key,
                   c.corridor_name,
                   COALESCE(c.importance_level, 0) AS importance_level
            FROM dim_corridor c
            WHERE c.corridor_version = (SELECT COALESCE(MAX(corridor_version), 1) FROM dim_corridor)
        ),
        recent_traffic AS (
            SELECT f.segment_key,
                   AVG(COALESCE(f.delay_seconds, 0)) AS avg_delay_seconds,
                   AVG(
                       CASE
                           WHEN f.free_flow_speed_kmh > 0 THEN f.free_flow_speed_kmh / NULLIF(f.current_speed_kmh, 0)
                           ELSE 1.0
                       END
                   ) AS avg_tti,
                   COUNT(*) AS sample_count
            FROM fact_traffic_flow f
            WHERE f.timestamp >= (NOW() - INTERVAL '7 days')
            GROUP BY f.segment_key
        ),
        recent_incident AS (
            SELECT i.segment_key,
                   COUNT(*) AS incident_count
            FROM fact_incident i
            WHERE i.timestamp >= (NOW() - INTERVAL '14 days')
            GROUP BY i.segment_key
        ),
        corridor_segment_candidates AS (
            SELECT
                ac.corridor_key,
                ac.corridor_name,
                ac.importance_level,
                s.segment_key,
                ST_Y(s.geometry_center) AS lat,
                ST_X(s.geometry_center) AS lon,
                COALESCE(w.default_lane_count, 2) AS lane_count,
                COALESCE(s.length_m, 0) AS length_m,
                COUNT(*) OVER (PARTITION BY ac.corridor_key) AS corridor_total_segments,
                (
                    COALESCE(rt.avg_delay_seconds, 0) * 0.50
                    + COALESCE(rt.avg_tti - 1.0, 0) * 120.0
                    + COALESCE(ri.incident_count, 0) * 8.0
                    + CASE
                        WHEN ac.importance_level >= 5 THEN 40.0
                        WHEN ac.importance_level = 4 THEN 24.0
                        ELSE 12.0
                      END
                ) AS critical_score
            FROM active_corridors ac
            JOIN bridge_corridor_segment bcs ON bcs.corridor_key = ac.corridor_key
            JOIN dim_segment s ON s.segment_key = bcs.segment_key
            JOIN dim_way w ON w.way_key = s.way_key
            LEFT JOIN recent_traffic rt ON rt.segment_key = s.segment_key
            LEFT JOIN recent_incident ri ON ri.segment_key = s.segment_key
            WHERE s.geometry_center IS NOT NULL
              AND w.osm_highway_type IN ('primary', 'secondary', 'tertiary', 'trunk')
        )
    SELECT corridor_key,
           corridor_name,
           importance_level,
           corridor_total_segments,
           segment_key,
           lat,
           lon,
           lane_count,
           length_m,
           critical_score
    FROM corridor_segment_candidates
    ORDER BY importance_level DESC, corridor_key, critical_score DESC, length_m DESC, segment_key
""")

# Legacy fallback limit (non-corridor mode, single key free tier).
_MAX_SEGMENTS_PER_CYCLE = 25
_OVERFETCH_FACTOR = 3

# Hard safety cap for target-corridor mode – set above max full-coverage budget
# so it never truncates legitimate high-key pools (e.g. 20 keys → ~1 323 segs/cycle).
_MAX_SEGMENTS_TARGET_CORRIDORS = 2000

# Realtime budget mode default: auto-computed from key pool at startup.
# Formula: (N_keys × daily_limit ÷ 34 cycles) - reserve - 10% headroom
# Examples: 1 key ≈ 63, 3 keys ≈ 192, 5 keys ≈ 327, 10 keys ≈ 656, 20 keys ≈ 1 323
def _compute_budget_safe_segments() -> int:
    n_keys = max(1, len(settings.get_tomtom_keys()))
    daily_limit = int(settings.tomtom_daily_limit_per_key or 2500)
    cycles = 34
    reserve = int(os.getenv("NON_TRAFFIC_REQ_RESERVE", "3"))
    headroom = float(os.getenv("TRAFFIC_REQ_HEADROOM_PCT", "0.10"))
    raw = max(1, n_keys * daily_limit // cycles - reserve)
    return max(1, int(raw * (1.0 - headroom)))


_BUDGET_SAFE_SEGMENTS_PER_CYCLE = _compute_budget_safe_segments()


def _get_min_corridor_coverage_pct() -> float:
        """Minimum corridor coverage guaranteed in pass 1.

        Environment override:
            TARGET_CORRIDOR_MIN_COVERAGE_PCT, default=0.60
        """
        raw = float(os.getenv("TARGET_CORRIDOR_MIN_COVERAGE_PCT", "0.60"))
        return max(0.05, min(0.80, raw))


def _resolve_option_default(value):
    """Return concrete value when receiving Typer OptionInfo defaults."""
    return getattr(value, "default", value)


def _allocate_target_corridor_segments(rows, limit: int) -> list[dict]:
    """Allocate segments using two-pass corridor coverage logic.

    Pass 1:
            Admit only the subset of corridors that the budget can support at the
            configured minimum coverage ratio.
    Pass 2:
            Use remaining budget to top up admitted high-priority corridors.
    """
    corridor_meta: dict[int, dict] = {}
    corridor_candidates: dict[int, list[tuple[int, float, float]]] = defaultdict(list)
    segment_memberships: dict[int, set[int]] = defaultdict(set)
    segment_records: dict[int, dict] = {}

    for row in rows:
        record = dict(row._mapping)
        corridor_key = int(record["corridor_key"])
        segment_key = int(record["segment_key"])
        importance_level = int(record["importance_level"] or 0)
        corridor_total_segments = int(record["corridor_total_segments"] or 0)
        critical_score = float(record["critical_score"] or 0.0)
        length_m = float(record["length_m"] or 0.0)

        corridor_meta.setdefault(
            corridor_key,
            {
                "name": record["corridor_name"] or f"corridor_{corridor_key}",
                "importance_level": importance_level,
                "total_segments": max(1, corridor_total_segments),
            },
        )
        corridor_candidates[corridor_key].append((segment_key, critical_score, length_m))
        segment_memberships[segment_key].add(corridor_key)
        segment_records.setdefault(
            segment_key,
            {
                "segment_key": segment_key,
                "lat": float(record["lat"]),
                "lon": float(record["lon"]),
                "lane_count": max(1, int(record["lane_count"] or 2)),
            },
        )

    for corridor_key in corridor_candidates:
        corridor_candidates[corridor_key].sort(key=lambda item: (-item[1], -item[2], item[0]))

    min_pct = _get_min_corridor_coverage_pct()
    min_targets = {
        corridor_key: min(
            meta["total_segments"],
            max(1, int(ceil(meta["total_segments"] * min_pct))),
        )
        for corridor_key, meta in corridor_meta.items()
    }
    corridor_priority = sorted(
        corridor_meta,
        key=lambda corridor_key: (
            -corridor_meta[corridor_key]["importance_level"],
            -corridor_meta[corridor_key]["total_segments"],
            corridor_key,
        ),
    )
    admitted_corridors: list[int] = []
    admitted_floor_cost = 0
    for corridor_key in corridor_priority:
        floor_cost = min_targets[corridor_key]
        if admitted_floor_cost + floor_cost <= limit:
            admitted_corridors.append(corridor_key)
            admitted_floor_cost += floor_cost
    if not admitted_corridors and corridor_priority:
        admitted_corridors.append(corridor_priority[0])
        admitted_floor_cost = min_targets[corridor_priority[0]]

    admitted_set = set(admitted_corridors)
    selected_segments: set[int] = set()
    selected_order: list[int] = []
    corridor_selected_counts = {corridor_key: 0 for corridor_key in corridor_meta}
    corridor_cursors = {corridor_key: 0 for corridor_key in corridor_meta}

    def _select_segment(segment_key: int) -> bool:
        if segment_key in selected_segments:
            return False
        selected_segments.add(segment_key)
        selected_order.append(segment_key)
        for member_corridor in segment_memberships.get(segment_key, set()):
            corridor_selected_counts[member_corridor] += 1
        return True

    def _next_available_segment(corridor_key: int) -> int | None:
        candidates = corridor_candidates[corridor_key]
        cursor = corridor_cursors[corridor_key]
        while cursor < len(candidates) and candidates[cursor][0] in selected_segments:
            cursor += 1
        corridor_cursors[corridor_key] = cursor
        if cursor >= len(candidates):
            return None
        return int(candidates[cursor][0])

    # Pass 1: minimum coverage floor for admitted corridors only.
    while len(selected_segments) < limit:
        pending = [
            corridor_key
            for corridor_key in admitted_corridors
            if corridor_selected_counts[corridor_key] < min_targets[corridor_key]
        ]
        if not pending:
            break

        pending.sort(
            key=lambda corridor_key: (
                corridor_selected_counts[corridor_key] / max(1, min_targets[corridor_key]),
                -corridor_meta[corridor_key]["importance_level"],
                corridor_meta[corridor_key]["total_segments"],
                corridor_key,
            )
        )

        progress = False
        for corridor_key in pending:
            next_segment = _next_available_segment(corridor_key)
            if next_segment is None:
                continue
            corridor_cursors[corridor_key] += 1
            if _select_segment(next_segment):
                progress = True
                if len(selected_segments) >= limit:
                    break
        if not progress:
            break

    pass1_selected = len(selected_segments)

    # Pass 2: top up admitted corridors only, prioritizing L5 then L4 then the rest.
    for eligible in (
        [corridor_key for corridor_key in admitted_corridors if corridor_meta[corridor_key]["importance_level"] >= 5],
        [corridor_key for corridor_key in admitted_corridors if corridor_meta[corridor_key]["importance_level"] == 4],
        [corridor_key for corridor_key in admitted_corridors if corridor_meta[corridor_key]["importance_level"] < 4],
    ):
        if not eligible:
            continue

        while len(selected_segments) < limit:
            progress = False
            ordered = sorted(
                eligible,
                key=lambda corridor_key: (
                    corridor_selected_counts[corridor_key] / max(1, corridor_meta[corridor_key]["total_segments"]),
                    -corridor_meta[corridor_key]["importance_level"],
                    -corridor_meta[corridor_key]["total_segments"],
                    corridor_key,
                ),
            )
            for corridor_key in ordered:
                next_segment = _next_available_segment(corridor_key)
                if next_segment is None:
                    continue
                corridor_cursors[corridor_key] += 1
                if _select_segment(next_segment):
                    progress = True
                    if len(selected_segments) >= limit:
                        break
            if not progress:
                break
        if len(selected_segments) >= limit:
            break

    logger.info(
        "[run-realtime] two-pass allocation: pass1_target_pct=%.2f, admitted_corridors=%d/%d, admitted_floor_cost=%d, pass1_selected=%d, total_selected=%d",
        min_pct,
        len(admitted_corridors),
        len(corridor_meta),
        admitted_floor_cost,
        pass1_selected,
        len(selected_segments),
    )

    coverage_preview = sorted(
        [
            (
                corridor_meta[corridor_key]["name"],
                corridor_selected_counts[corridor_key],
                corridor_meta[corridor_key]["total_segments"],
                corridor_selected_counts[corridor_key] / max(1, corridor_meta[corridor_key]["total_segments"]),
            )
            for corridor_key in admitted_corridors
        ],
        key=lambda item: (item[3], item[2], item[0]),
    )
    for corridor_name, selected_count, total_segments, coverage in coverage_preview[:8]:
        logger.info(
            "[run-realtime] coverage preview: %s -> %d/%d (%.1f%%)",
            corridor_name,
            selected_count,
            total_segments,
            coverage * 100.0,
        )

    skipped_preview = [corridor_meta[corridor_key]["name"] for corridor_key in corridor_priority if corridor_key not in admitted_set]
    if skipped_preview:
        logger.info(
            "[run-realtime] skipped corridors due to quality floor budget: %s",
            ", ".join(skipped_preview[:12]),
        )

    return [segment_records[segment_key] for segment_key in selected_order[:limit]]


def _load_segment_points(
    engine: Engine,
    limit: int = _MAX_SEGMENTS_PER_CYCLE,
    bbox: dict | None = None,
    target_corridor_mode: bool = False,
    full_target_coverage: bool = True,
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
        target_corridor_mode: If True, use priority corridor critical-segment selection
        full_target_coverage: If True, force full target-corridor coverage.
        overfetch_factor: Fetch extra candidates to compensate invalid/duplicate points
    """
    points = []
    seg_keys: list[int] = []
    seg_map: dict[tuple, int] = {}
    lane_count_map: dict[int, int] = {}
    
    # Ensure limit is int (Typer OptionInfo → int when called from run_all)
    limit = int(_resolve_option_default(limit)) if not isinstance(limit, int) else limit
    
    # For target corridor mode we always honor caller-provided limit.
    if target_corridor_mode:
        effective_limit = limit
        query_limit = limit
    else:
        query_limit = max(limit, int(limit * max(1, overfetch_factor)))

    with engine.connect() as conn:
        if target_corridor_mode:
            rows = conn.execute(_SEGMENT_QUERY_BY_TARGET_CORRIDORS).fetchall()
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
    
    if target_corridor_mode:
        rows = _allocate_target_corridor_segments(rows, effective_limit)

    seen_segment_keys: set[int] = set()
    duplicate_count = 0
    for row in rows:
        if target_corridor_mode:
            seg_key = int(row["segment_key"])
            lat = float(row["lat"])
            lon = float(row["lon"])
            lane_count = int(row["lane_count"])
        else:
            seg_key, lat, lon, lane_count = row
        if int(seg_key) in seen_segment_keys:
            duplicate_count += 1
            continue

        pt = (round(lat, 6), round(lon, 6))
        seen_segment_keys.add(int(seg_key))

        points.append(pt)
        seg_keys.append(seg_key)
        seg_map[pt] = seg_key
        lane_count_map[int(seg_key)] = max(1, int(lane_count or 2))

        # For target corridors, use effective_limit; otherwise use original limit
        actual_limit = effective_limit if target_corridor_mode else limit
        if len(points) >= actual_limit:
            break
    
    mode_label = "priority_corridors_critical" if target_corridor_mode else (f"bbox: {bbox}" if bbox else "all")
    logger.info(
        f"[run-realtime] Loaded {len(points)} segment points from DB ({mode_label}) "
        f"(query_limit={query_limit}, duplicates_skipped={duplicate_count})"
    )
    return points, seg_keys, seg_map, lane_count_map


@app.command("run-realtime")
def run_realtime(
    segment_limit: int = typer.Option(
        _BUDGET_SAFE_SEGMENTS_PER_CYCLE,
        min=1,
        max=5000,
        help="Max number of critical segment points queried per realtime cycle",
    ),
    budget_mode: bool = typer.Option(
        False,
        help="Enable budget mode to honor --segment-limit instead of forcing full target coverage",
    ),
) -> None:
    """Phase 3: Weather → Traffic Flow → Incident (1 cycle, cron 15p).

    **OFFICIAL MODE**: Uses priority corridors + critical segments from dim_corridor.
    
    Thứ tự:
        dim_weather (trả weather_key) → fact_traffic_flow → fact_incident
    """
    start_time = time.time()
    engine = get_engine()
    segment_limit = int(_resolve_option_default(segment_limit))
    budget_mode = bool(_resolve_option_default(budget_mode))
    if budget_mode and segment_limit >= _MAX_SEGMENTS_TARGET_CORRIDORS:
        segment_limit = _BUDGET_SAFE_SEGMENTS_PER_CYCLE
        logger.info(
            "[run-realtime] budget_mode enabled without strict --segment-limit; "
            f"fallback to {_BUDGET_SAFE_SEGMENTS_PER_CYCLE} segments"
        )
    total = 0
    results = []

    console.print(Panel.fit(
        "[bold cyan]🌤️  PHASE 3: REAL-TIME DATA (PRIORITY CORRIDORS)[/bold cyan]\n"
        "[dim]Weather + Traffic Flow + Incidents (critical segments)[/dim]",
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

        # Load segment coordinates from DB (priority corridors + critical segments)
        task2 = progress.add_task("[cyan]Loading critical segment points...", total=None)
        points, segment_keys, segment_key_map, lane_count_map = _load_segment_points(
            engine,
            limit=segment_limit,
            target_corridor_mode=True,
            full_target_coverage=not budget_mode,
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


@app.command("run-cycle")
def run_cycle(
    segment_limit: int = typer.Option(
        _BUDGET_SAFE_SEGMENTS_PER_CYCLE,
        min=1,
        max=5000,
        help="Segment cap for realtime step in this cycle",
    ),
    budget_mode: bool = typer.Option(
        True,
        help="Run realtime step in budget mode (recommended for scheduler parity)",
    ),
) -> None:
    """Run one full ETL cycle: realtime then batch.

    This command is designed for dry-run/manual triggering of a single cycle
    without waiting for scheduler cron windows.
    """
    overall_start = time.time()
    segment_limit = int(_resolve_option_default(segment_limit))
    budget_mode = bool(_resolve_option_default(budget_mode))

    console.print("\n" + "═" * 80)
    console.print(Panel.fit(
        "[bold white]🔁 ONE-SHOT ETL CYCLE[/bold white]\n"
        "[dim]Step 1: run-realtime  →  Step 2: run-batch[/dim]",
        border_style="bold white"
    ))
    console.print("═" * 80 + "\n")

    logger.info(
        "[run-cycle] starting one-shot cycle (budget_mode=%s, segment_limit=%s)",
        budget_mode,
        segment_limit,
    )

    run_realtime(segment_limit=segment_limit, budget_mode=budget_mode)
    run_batch()

    overall_elapsed = time.time() - overall_start
    logger.info("[run-cycle] cycle completed in %.1fs", overall_elapsed)

    console.print(Panel.fit(
        f"[bold green]✅ ONE-SHOT CYCLE COMPLETE[/bold green]\n"
        f"[dim]Total execution time: {overall_elapsed:.2f}s ({overall_elapsed/60:.1f} minutes)[/dim]",
        border_style="green"
    ))
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
