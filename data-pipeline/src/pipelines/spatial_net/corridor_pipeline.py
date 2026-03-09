"""Corridor & Corridor-Segment Bridge Configuration Pipeline.

Corridors are NOT created for every road. Instead, we build a prioritized set of
strategic corridors using multi-factor scoring:
    - Traffic pressure (avg traffic_index from fact_traffic_flow)
    - Traffic volume (avg pcu_volume from fact_traffic_flow)
    - Incident intensity (count from fact_incident)
    - Infrastructure importance (FRC + lane_count + arterial type)

Only high-priority arterial routes are promoted into:
    - dim_corridor
    - bridge_corridor_segment

Load strategy: Full DELETE + INSERT for bridge table (route refresh consistency).
"""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from rich.console import Console
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskID,
    TextColumn,
    TimeElapsedColumn,
)
from rich.table import Table
from sqlalchemy import Engine, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.core.exceptions import DatabaseLoadError
from src.core.logger import get_logger
from src.domain.geo.constants import BBOX_DISTRICT_1
from src.domain.math import derive_date_key
from src.domain.math.key_generator import generate_corridor_key
from src.pipelines.base import BaseExtractor, BaseLoader, BaseTransformer, get_table

# Rich console for formatted output
console = Console()


# ═══════════════════════════════════════════════════════════
# EXTRACTOR
# ═══════════════════════════════════════════════════════════


class CorridorExtractor(BaseExtractor):
    """Generate prioritized corridor config from road + realtime facts."""

    DEFAULT_CORRIDOR_LIMIT = 60
    MIN_SEGMENTS_PER_CORRIDOR = 4
    MIN_CORRIDOR_LENGTH_M = 1200.0
    # Relaxed thresholds for roads with meaningful footprint inside Q1.
    MIN_Q1_SEGMENTS_PER_CORRIDOR = 2
    MIN_Q1_CORRIDOR_LENGTH_M = 800.0

    @staticmethod
    def _is_valid_road_name(road_name: str | None) -> bool:
        """Filter out noisy unnamed/invalid road labels from OSM."""
        if not road_name:
            return False
        normalized = road_name.strip().lower()
        return normalized not in {"", "nan", "none", "null", "unknown", "unnamed road"}

    @staticmethod
    def _derive_importance_level(frc: int | None) -> int:
        if frc is None:
            return 4
        if frc <= 1:
            return 1
        if frc == 2:
            return 2
        if frc == 3:
            return 3
        if frc == 4:
            return 4
        return 5

    @staticmethod
    def _normalize_direction(direction: str | None) -> str:
        value = (direction or "").strip().lower()
        if value == "forward":
            return "Forward"
        if value == "backward":
            return "Backward"
        if value == "both":
            return "Both"
        return "Mixed"

    @staticmethod
    def _derive_importance_from_priority(priority_score: float) -> int:
        """Map priority score (0-100) to importance level (1-5, 1 highest)."""
        if priority_score >= 70:
            return 1
        if priority_score >= 55:
            return 2
        if priority_score >= 40:
            return 3
        if priority_score >= 25:
            return 4
        return 5

    @staticmethod
    def _derive_target_speed(max_speed_limit: float, avg_traffic_index: float) -> float:
        """Derive target speed from design speed adjusted by observed congestion."""
        base_speed = max(20.0, float(max_speed_limit or 40.0))
        traffic_idx = max(0.0, min(1.0, float(avg_traffic_index or 0.0)))
        adjusted = base_speed * (1.0 - 0.25 * traffic_idx)
        return round(max(20.0, adjusted), 2)

    def extract(self, **kwargs: Any) -> dict:
        """Extract prioritized corridors from spatial dimensions + realtime facts."""
        console.print("\n[bold cyan]📥 EXTRACTION PHASE[/bold cyan]")
        console.print(
            "[dim]Source: Ranked arterial routes from "
            "dim_road/dim_way/dim_segment + fact_traffic_flow + fact_incident[/dim]\n"
        )

        engine: Engine | None = kwargs.get("engine")
        if engine is None:
            raise ValueError("CorridorExtractor.extract requires engine=... in kwargs")

        corridor_limit = int(kwargs.get("corridor_limit", self.DEFAULT_CORRIDOR_LIMIT))
        min_segments = int(kwargs.get("min_segments", self.MIN_SEGMENTS_PER_CORRIDOR))
        min_length_m = float(kwargs.get("min_length_m", self.MIN_CORRIDOR_LENGTH_M))
        min_q1_segments = int(
            kwargs.get("min_q1_segments", self.MIN_Q1_SEGMENTS_PER_CORRIDOR)
        )
        min_q1_length_m = float(
            kwargs.get("min_q1_length_m", self.MIN_Q1_CORRIDOR_LENGTH_M)
        )
        q1_bbox = kwargs.get("q1_bbox", BBOX_DISTRICT_1)
        since_date_key = int(
            kwargs.get(
                "since_date_key",
                derive_date_key(datetime.utcnow() - timedelta(days=30)),
            )
        )

        roads_sql = text("""
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
            road_base AS (
                SELECT
                    r.road_key,
                    r.name AS road_name,
                    MIN(w.tomtom_frc) AS min_frc,
                    MAX(COALESCE(w.default_speed_limit, 0)) AS max_speed_limit,
                    MIN(w.direction) AS direction_hint,
                    AVG(COALESCE(w.default_lane_count, 2)) AS avg_lane_count,
                    COUNT(ds.segment_key) AS segment_count,
                    SUM(COALESCE(ds.length_m, 0)) AS total_length_m,
                    COUNT(
                        CASE
                            WHEN ds.geometry_center IS NOT NULL AND (
                                 (qb.geom IS NOT NULL AND ST_Intersects(ds.geometry_center, qb.geom))
                                 OR (
                                     qb.geom IS NULL
                                     AND ST_X(ds.geometry_center) BETWEEN :q1_min_lon AND :q1_max_lon
                                     AND ST_Y(ds.geometry_center) BETWEEN :q1_min_lat AND :q1_max_lat
                                 )
                            )
                            THEN ds.segment_key
                        END
                    ) AS q1_segment_count,
                    SUM(
                        CASE
                            WHEN ds.geometry_center IS NOT NULL AND (
                                 (qb.geom IS NOT NULL AND ST_Intersects(ds.geometry_center, qb.geom))
                                 OR (
                                     qb.geom IS NULL
                                     AND ST_X(ds.geometry_center) BETWEEN :q1_min_lon AND :q1_max_lon
                                     AND ST_Y(ds.geometry_center) BETWEEN :q1_min_lat AND :q1_max_lat
                                 )
                            )
                            THEN COALESCE(ds.length_m, 0)
                            ELSE 0
                        END
                    ) AS q1_total_length_m,
                    BOOL_OR(
                        w.osm_highway_type IN (
                            'motorway', 'motorway_link',
                            'trunk', 'trunk_link',
                            'primary', 'primary_link',
                            'secondary', 'secondary_link'
                        )
                    ) AS has_arterial_type
                FROM dim_road r
                JOIN dim_way w ON w.road_key = r.road_key
                JOIN dim_segment ds ON ds.way_key = w.way_key
                CROSS JOIN q1_boundary qb
                GROUP BY r.road_key, r.name
            ),
            traffic_30d AS (
                SELECT
                    w.road_key,
                    AVG(COALESCE(f.pcu_volume, 0)) AS avg_pcu_volume,
                    AVG(COALESCE(f.traffic_index, 0)) AS avg_traffic_index,
                    COUNT(*) AS flow_samples
                FROM fact_traffic_flow f
                JOIN dim_segment ds ON ds.segment_key = f.segment_key
                JOIN dim_way w ON w.way_key = ds.way_key
                WHERE f.date_key >= :since_date_key
                GROUP BY w.road_key
            ),
            incident_30d AS (
                SELECT
                    w.road_key,
                    COUNT(*) AS incident_count
                FROM fact_incident i
                JOIN dim_segment ds ON ds.segment_key = i.segment_key
                JOIN dim_way w ON w.way_key = ds.way_key
                WHERE i.date_key >= :since_date_key
                GROUP BY w.road_key
            )
            SELECT
                rb.road_key,
                rb.road_name,
                rb.min_frc,
                rb.max_speed_limit,
                rb.direction_hint,
                rb.avg_lane_count,
                rb.segment_count,
                rb.total_length_m,
                rb.q1_segment_count,
                rb.q1_total_length_m,
                COALESCE(t.avg_pcu_volume, 0) AS avg_pcu_volume,
                COALESCE(t.avg_traffic_index, 0) AS avg_traffic_index,
                COALESCE(t.flow_samples, 0) AS flow_samples,
                COALESCE(i.incident_count, 0) AS incident_count,
                (
                    0.35 * LEAST(100.0, COALESCE(t.avg_traffic_index, 0) * 100.0)
                    + 0.30 * LEAST(100.0, COALESCE(t.avg_pcu_volume, 0) / 20.0)
                    + 0.20 * LEAST(100.0, COALESCE(i.incident_count, 0) * 5.0)
                    + 0.15 * (
                        0.6 * CASE
                            WHEN rb.min_frc IS NULL THEN 45.0
                            WHEN rb.min_frc <= 1 THEN 100.0
                            WHEN rb.min_frc = 2 THEN 85.0
                            WHEN rb.min_frc = 3 THEN 70.0
                            WHEN rb.min_frc = 4 THEN 55.0
                            ELSE 40.0
                        END
                        + 0.4 * LEAST(100.0, COALESCE(rb.avg_lane_count, 2) * 25.0)
                    )
                ) AS priority_score
            FROM road_base rb
            LEFT JOIN traffic_30d t ON t.road_key = rb.road_key
            LEFT JOIN incident_30d i ON i.road_key = rb.road_key
            WHERE (
                    (
                        rb.segment_count >= :min_segments
                        AND rb.total_length_m >= :min_length_m
                    )
                    OR (
                        rb.q1_segment_count >= :min_q1_segments
                        AND rb.q1_total_length_m >= :min_q1_length_m
                    )
                  )
              AND (rb.has_arterial_type = TRUE OR COALESCE(rb.min_frc, 6) <= 3)
            ORDER BY priority_score DESC, COALESCE(t.flow_samples, 0) DESC, rb.segment_count DESC
            LIMIT :limit
        """)

        segments_sql = text("""
            SELECT
                w.road_key,
                ds.segment_key
            FROM dim_segment ds
            JOIN dim_way w ON w.way_key = ds.way_key
            ORDER BY
                w.road_key,
                ds.location_key,
                ds.segment_id_source NULLS LAST,
                ds.segment_key
        """)

        with engine.connect() as conn:
            road_rows = conn.execute(
                roads_sql,
                {
                    "since_date_key": since_date_key,
                    "min_segments": min_segments,
                    "min_length_m": min_length_m,
                    "min_q1_segments": min_q1_segments,
                    "min_q1_length_m": min_q1_length_m,
                    "q1_min_lon": q1_bbox["min_lon"],
                    "q1_max_lon": q1_bbox["max_lon"],
                    "q1_min_lat": q1_bbox["min_lat"],
                    "q1_max_lat": q1_bbox["max_lat"],
                    "limit": corridor_limit,
                },
            ).fetchall()

            if not road_rows:
                self.logger.warning(
                    "No prioritized corridors found with strict filter; retrying relaxed thresholds"
                )
                road_rows = conn.execute(
                    roads_sql,
                    {
                        "since_date_key": since_date_key,
                        "min_segments": 1,
                        "min_length_m": 300.0,
                        "min_q1_segments": 1,
                        "min_q1_length_m": 300.0,
                        "q1_min_lon": q1_bbox["min_lon"],
                        "q1_max_lon": q1_bbox["max_lon"],
                        "q1_min_lat": q1_bbox["min_lat"],
                        "q1_max_lat": q1_bbox["max_lat"],
                        "limit": corridor_limit,
                    },
                ).fetchall()

            segment_rows = conn.execute(segments_sql).fetchall()

        segments_by_road: dict[int, list[int]] = defaultdict(list)
        for row in segment_rows:
            segments_by_road[int(row.road_key)].append(int(row.segment_key))

        corridors_data: list[dict[str, Any]] = []
        for row in road_rows:
            road_key = int(row.road_key)
            segment_keys = segments_by_road.get(road_key, [])
            if not segment_keys:
                continue

            road_name = (row.road_name or "").strip()
            if not self._is_valid_road_name(road_name):
                continue
            corridor_name = f"Priority Corridor – {road_name}"
            priority_score = float(row.priority_score or 0.0)
            importance_level = self._derive_importance_from_priority(priority_score)
            target_avg_speed = self._derive_target_speed(
                float(row.max_speed_limit or 40.0),
                float(row.avg_traffic_index or 0.0),
            )

            segments = [
                {"segment_key": seg_key, "sequence_order": idx + 1}
                for idx, seg_key in enumerate(segment_keys)
            ]

            corridors_data.append(
                {
                    "corridor_name": corridor_name,
                    "importance_level": importance_level,
                    "target_avg_speed": target_avg_speed,
                    "total_length_m": float(row.total_length_m or 0.0),
                    "direction": self._normalize_direction(row.direction_hint),
                    "priority_score": round(priority_score, 2),
                    "flow_samples": int(row.flow_samples or 0),
                    "incident_count": int(row.incident_count or 0),
                    "segments": segments,
                }
            )

        # Display sample corridors in table
        table = Table(title="Prioritized Corridors", show_header=True, header_style="bold magenta")
        table.add_column("Corridor Name", style="cyan", width=30)
        table.add_column("Direction", style="green", width=12)
        table.add_column("Importance", justify="center", style="yellow", width=10)
        table.add_column("Priority", justify="right", style="bright_yellow", width=10)
        table.add_column("Segments", justify="center", style="blue", width=10)
        table.add_column("Length (m)", justify="right", style="magenta", width=12)

        for corridor in corridors_data[:20]:
            table.add_row(
                corridor["corridor_name"],
                corridor["direction"],
                str(corridor["importance_level"]),
                f"{corridor['priority_score']:.1f}",
                str(len(corridor["segments"])),
                f"{corridor['total_length_m']:.1f}",
            )

        console.print(table)
        if len(corridors_data) > 20:
            console.print(
                f"[dim]... showing 20/{len(corridors_data)} corridors[/dim]"
            )
        console.print(f"\n[green]✓[/green] Extracted [bold]{len(corridors_data)}[/bold] corridor configs\n")
        
        self.logger.info(f"Extracted {len(corridors_data)} corridor configs")
        return {"corridors": corridors_data}


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class CorridorTransformer(BaseTransformer):
    """Transform corridor configs → dim_corridor + bridge_corridor_segment records."""

    def transform(self, raw_data: dict) -> dict[str, list[dict]]:
        """Transform raw corridor configs.
        
        Returns:
            dict with 'dim_corridor' and 'bridge_corridor_segment' keys.
        """
        console.print("\n[bold cyan]🔄 TRANSFORMATION PHASE[/bold cyan]")
        corridors_data = raw_data.get("corridors", [])
        now = datetime.utcnow()

        corridor_records = []
        bridge_records = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            task = progress.add_task(
                "[cyan]Processing corridors...",
                total=len(corridors_data)
            )

            for idx, corridor_cfg in enumerate(corridors_data, 1):
                corridor_name = corridor_cfg["corridor_name"]
                corridor_key = generate_corridor_key(corridor_name)
                if idx <= 20:
                    console.print(
                        f"  [dim]├─ [{idx}/{len(corridors_data)}][/dim] "
                        f"[cyan]{corridor_name}[/cyan] "
                        f"[dim](key: {corridor_key})[/dim]"
                    )

                # ── dim_corridor record ────────────────────────────────
                corridor_records.append({
                    "corridor_key": corridor_key,
                    "corridor_name": corridor_name,
                    "importance_level": corridor_cfg.get("importance_level", 5),
                    "target_avg_speed": float(corridor_cfg.get("target_avg_speed", 40.0)),
                    "total_length_m": float(corridor_cfg.get("total_length_m", 0.0)),
                    "direction": corridor_cfg.get("direction", "Unknown"),
                    "record_timestamp": now,
                })

                # ── bridge_corridor_segment records ────────────────────
                # Segments must respect sequence_order (1, 2, 3, ...)
                # Support both segment_key (preferred) and segment_id_source (fallback)
                segments = corridor_cfg.get("segments", [])
                if idx <= 20:
                    console.print(
                        f"     [dim]└─ Generating {len(segments)} bridge records[/dim]"
                    )
                for seg_cfg in segments:
                    # Prefer segment_key if provided, fallback to segment_id_source
                    segment_ref = seg_cfg.get("segment_key") or seg_cfg.get("segment_id_source")
                    if not segment_ref:
                        self.logger.warning(
                            f"Skipping segment in corridor {corridor_name}: missing segment_key or segment_id_source"
                        )
                        continue
                    
                    bridge_records.append({
                        "corridor_key": corridor_key,
                        "segment_key": int(segment_ref),
                        "sequence_order": int(seg_cfg["sequence_order"]),
                    })

                progress.update(task, advance=1)

        console.print(
            f"\n[green]✓[/green] Transformed [bold]{len(corridor_records)}[/bold] corridor records, "
            f"[bold]{len(bridge_records)}[/bold] bridge records\n"
        )
        if len(corridors_data) > 20:
            console.print(
                f"[dim]... transformed {len(corridors_data)} corridors (showing first 20 above)[/dim]\n"
            )

        self.logger.info(
            f"Transformed {len(corridor_records)} corridor, "
            f"{len(bridge_records)} bridge_corridor_segment records"
        )

        return {
            "dim_corridor": corridor_records,
            "bridge_corridor_segment": bridge_records,
        }


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class CorridorLoader(BaseLoader):
    """Loader for dim_corridor table (standard UPSERT).
    
    Conflict target: corridor_key
    Update on conflict: corridor_name, direction, target_avg_speed
    """

    TABLE_NAME = "dim_corridor"
    CONFLICT_KEYS = ["corridor_key"]
    UPDATE_COLUMNS = [
        "corridor_name",
        "importance_level",
        "target_avg_speed",
        "total_length_m",
        "direction",
        "record_timestamp",
    ]
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        """UPSERT corridor records."""
        return self._upsert_batch(records)


class BridgeCorridorSegmentLoader(BaseLoader):
    """Loader for bridge_corridor_segment table (DELETE + INSERT strategy).
    
    This loader is part of load_corridors() transaction to handle route restructuring.
    """

    TABLE_NAME = "bridge_corridor_segment"
    CONFLICT_KEYS = ["corridor_key", "sequence_order"]
    UPDATE_COLUMNS = []
    BATCH_SIZE = 1000

    def load(self, records: list[dict]) -> int:
        """Standard UPSERT for bridge records."""
        return self._upsert_batch(records)


# ═══════════════════════════════════════════════════════════
# TRANSACTION MANAGER
# ═══════════════════════════════════════════════════════════


def load_corridors(
    engine: Engine,
    corridor_records: list[dict],
    bridge_records: list[dict],
) -> dict[str, int]:
    """Load corridors with full transaction control.
    
    Strategy (city-wide refresh):
    1. UPSERT dim_corridor from generated corridor records
    2. DELETE FROM bridge_corridor_segment (full refresh)
    3. INSERT INTO bridge_corridor_segment (bulk insert)
    
    All in ONE transaction with rollback on error.
    
    Args:
        engine: SQLAlchemy Engine
        corridor_records: List of dim_corridor records
        bridge_records: List of bridge_corridor_segment records
    
    Returns:
        dict with counts: {"corridors_upserted": int, "bridge_deleted": int, "bridge_inserted": int}
    
    Raises:
        DatabaseLoadError: On transaction failure with auto-rollback
    """
    console.print("\n[bold cyan]💾 LOADING PHASE[/bold cyan]")
    console.print("[dim]Strategy: Transactional UPSERT with DELETE+INSERT for bridges[/dim]\n")
    
    logger = get_logger("load_corridors")
    
    result = {
        "corridors_upserted": 0,
        "bridge_deleted": 0,
        "bridge_inserted": 0,
        "bridge_skipped": 0,
        "bridge_resolved": 0,
    }

    if not corridor_records:
        logger.warning("No corridor records to load")
        console.print("[yellow]⚠[/yellow] No corridor records to load\n")
        return result

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            with Session(engine) as session:
                with session.begin():
                    # ────────────────────────────────────────────────
                    # STEP 1: UPSERT dim_corridor
                    # ────────────────────────────────────────────────
                    task1 = progress.add_task(
                        "[cyan]Step 1/3: UPSERT dim_corridor...",
                        total=None
                    )
                    
                    corridor_loader = CorridorLoader(engine)
                    corridors_upserted = corridor_loader.load(corridor_records)
                    result["corridors_upserted"] = corridors_upserted
                    
                    progress.update(task1, completed=True)
                    console.print(f"  [green]✓[/green] UPSERT [bold]{corridors_upserted}[/bold] dim_corridor records")
                    logger.info(f"✓ Upserted {corridors_upserted} dim_corridor records")

                    # ────────────────────────────────────────────────
                    # STEP 2: DELETE old bridge records (full refresh)
                    # ────────────────────────────────────────────────
                    task2 = progress.add_task(
                        "[cyan]Step 2/3: DELETE old bridge records...",
                        total=None
                    )

                    result_delete = session.execute(
                        text("DELETE FROM bridge_corridor_segment")
                    )
                    result["bridge_deleted"] = result_delete.rowcount

                    progress.update(task2, completed=True)
                    console.print(f"  [green]✓[/green] DELETE [bold]{result['bridge_deleted']}[/bold] old bridge records")
                    logger.info(
                        f"✓ Deleted {result['bridge_deleted']} old bridge_corridor_segment records"
                    )

                    # ────────────────────────────────────────────────
                    # STEP 3: INSERT new bridge records (bulk)
                    # ────────────────────────────────────────────────
                    task3 = progress.add_task(
                        "[cyan]Step 3/3: INSERT new bridge records...",
                        total=None
                    )
                    
                    if bridge_records:
                        resolved_bridge_records = [
                            {
                                "corridor_key": int(record["corridor_key"]),
                                "segment_key": int(record["segment_key"]),
                                "sequence_order": int(record["sequence_order"]),
                            }
                            for record in bridge_records
                        ]

                        result["bridge_resolved"] = 0
                        result["bridge_skipped"] = 0

                        bridge_table = get_table("bridge_corridor_segment", engine)
                        insert_stmt = pg_insert(bridge_table).values(resolved_bridge_records)
                        if resolved_bridge_records:
                            session.execute(insert_stmt)
                        result["bridge_inserted"] = len(resolved_bridge_records)

                        progress.update(task3, completed=True)
                        console.print(f"  [green]✓[/green] INSERT [bold]{result['bridge_inserted']}[/bold] new bridge records")
                        logger.info(
                            f"✓ Inserted {result['bridge_inserted']} new bridge_corridor_segment records"
                        )

                    cleanup_sql = text("""
                        DELETE FROM dim_corridor dc
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM bridge_corridor_segment bcs
                            WHERE bcs.corridor_key = dc.corridor_key
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM fact_corridor_performance fcp
                            WHERE fcp.corridor_key = dc.corridor_key
                              AND fcp.date_key >= :cleanup_min_date_key
                        )
                    """)
                    cleanup_min_date_key = int(
                        derive_date_key(datetime.utcnow() - timedelta(days=30))
                    )
                    session.execute(cleanup_sql, {"cleanup_min_date_key": cleanup_min_date_key})

                    # Transaction auto-commits here (successful session.begin() context exit)
                    console.print("\n[green]✅ Transaction committed successfully![/green]")
                    logger.info(
                        f"✅ Corridor load transaction committed: "
                        f"corridors={result['corridors_upserted']}, "
                        f"bridge_deleted={result['bridge_deleted']}, "
                        f"bridge_inserted={result['bridge_inserted']}, "
                        f"bridge_skipped={result['bridge_skipped']}, "
                        f"bridge_resolved={result['bridge_resolved']}"
                    )

    except Exception as e:
        console.print(f"\n[bold red]❌ Transaction failed![/bold red]")
        console.print(f"[red]Error: {str(e)}[/red]\n")
        logger.error(f"❌ Corridor load transaction failed: {e}")
        # Session auto-rollbacks here (exception in context manager)
        raise DatabaseLoadError(
            message="Failed to load corridors (dim_corridor + bridge_corridor_segment)",
            detail=str(e),
        )

    return result


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """Execute full corridor ETL pipeline.
    
    Returns:
        int: Total records loaded (corridors + bridge)
    """
    logger = get_logger("corridor_pipeline")
    start_time = time.time()

    console.print("\n" + "═" * 70)
    console.print("[bold yellow]🛣️  CORRIDOR ETL PIPELINE[/bold yellow]")
    console.print("[dim]Loading traffic corridor infrastructure[/dim]")
    console.print("═" * 70)

    # Extract
    extractor = CorridorExtractor()
    raw_data = extractor.extract(engine=engine, **kwargs)

    # Transform
    transformer = CorridorTransformer()
    transformed = transformer.transform(raw_data)

    corridor_records = transformed["dim_corridor"]
    bridge_records = transformed["bridge_corridor_segment"]

    # Load (with transaction)
    result = load_corridors(engine, corridor_records, bridge_records)

    # Calculate totals and execution time
    total = result["corridors_upserted"] + result["bridge_inserted"]
    elapsed = time.time() - start_time

    # Display final summary
    console.print("\n" + "─" * 70)
    console.print("[bold green]📊 PIPELINE SUMMARY[/bold green]\n")
    
    summary_table = Table(show_header=True, header_style="bold cyan", box=None)
    summary_table.add_column("Metric", style="cyan", width=35)
    summary_table.add_column("Count", justify="right", style="green", width=15)
    
    summary_table.add_row("Corridors Upserted", f"{result['corridors_upserted']:,}")
    summary_table.add_row("Bridge Records Deleted", f"{result['bridge_deleted']:,}")
    summary_table.add_row("Bridge Records Inserted", f"{result['bridge_inserted']:,}")
    summary_table.add_row("Bridge Records Skipped", f"{result['bridge_skipped']:,}")
    summary_table.add_row("Segment Refs Resolved", f"{result['bridge_resolved']:,}")
    summary_table.add_row("─" * 35, "─" * 15)
    summary_table.add_row("[bold]Total Records Loaded[/bold]", f"[bold]{total:,}[/bold]")
    summary_table.add_row("[bold]Execution Time[/bold]", f"[bold]{elapsed:.2f}s[/bold]")
    
    console.print(summary_table)
    console.print("\n[bold green]✅ Corridor pipeline completed successfully![/bold green]")
    console.print("═" * 70 + "\n")

    logger.info(f"[run-corridor] {total} total records loaded in {elapsed:.2f}s")

    return total
