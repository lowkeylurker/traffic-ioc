"""Segment-Location Mapper Pipeline.

Maps each segment (dim_segment) to a location (dim_location) using robust spatial fallbacks.

Matching strategy:
1) Exact/edge-safe polygon coverage with ST_Covers
2) Nearest polygon fallback for remaining unmapped segments

This pipeline runs AFTER location_pipeline and osm_pipeline to ensure:
- All locations have geometry_polygon loaded
- All segments have geometry_center populated
"""

from __future__ import annotations

from sqlalchemy import Engine, text

from src.core.logger import get_logger


logger = get_logger(__name__)


def _resolve_location_geometry_column(engine: Engine) -> str:
    query = text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'dim_location'
          AND udt_name = 'geometry'
    """)
    with engine.connect() as conn:
        columns = {row[0] for row in conn.execute(query).fetchall()}

    if "geometry_polygon" in columns:
        return "geometry_polygon"
    if "geometry" in columns:
        return "geometry"
    if columns:
        return sorted(columns)[0]

    raise RuntimeError(
        "dim_location is missing geometry column. Expected 'geometry_polygon' or 'geometry'."
    )


def _count_unmapped_segments(conn) -> int:
    result = conn.execute(
        text("SELECT COUNT(*) FROM dim_segment WHERE location_key IS NULL")
    )
    return int(result.scalar() or 0)


def _backfill_missing_segment_centers(conn) -> int:
    query = text("""
        UPDATE dim_segment
        SET geometry_center = ST_Centroid(geometry_linestring)
        WHERE geometry_center IS NULL
          AND geometry_linestring IS NOT NULL
    """)
    result = conn.execute(query)
    return int(result.rowcount or 0)


def _map_by_polygon_coverage(conn, geometry_column: str) -> int:
    query = text(f"""
                WITH coverage AS (
                        SELECT DISTINCT ON (ds.segment_key)
                                ds.segment_key,
                                dl.location_key
                        FROM dim_segment ds
                        JOIN dim_location dl
                            ON dl.{geometry_column} IS NOT NULL
                         AND ds.location_key IS NULL
                         AND ds.geometry_center IS NOT NULL
                         AND ST_Covers(dl.{geometry_column}, ds.geometry_center)
                        ORDER BY ds.segment_key, ST_Area(dl.{geometry_column}) ASC
                )
        UPDATE dim_segment ds
                SET location_key = coverage.location_key
                FROM coverage
                WHERE ds.segment_key = coverage.segment_key
                    AND ds.location_key IS NULL
    """)
    result = conn.execute(query)
    return int(result.rowcount or 0)


def _map_by_nearest_polygon(conn, geometry_column: str) -> int:
    query = text(f"""
        WITH nearest AS (
            SELECT DISTINCT ON (ds.segment_key)
                ds.segment_key,
                dl.location_key
            FROM dim_segment ds
            JOIN dim_location dl
              ON dl.{geometry_column} IS NOT NULL
             AND ds.location_key IS NULL
             AND ds.geometry_center IS NOT NULL
            ORDER BY ds.segment_key, dl.{geometry_column} <-> ds.geometry_center
        )
        UPDATE dim_segment ds
        SET location_key = nearest.location_key
        FROM nearest
        WHERE ds.segment_key = nearest.segment_key
          AND ds.location_key IS NULL
    """)
    result = conn.execute(query)
    return int(result.rowcount or 0)


def run(engine: Engine, **kwargs) -> int:
    """Map all segments to locations with robust fallback strategy.

    Prerequisites:
    - dim_location must be populated with geometry polygons
    - dim_segment should have geometry_center (auto-backfilled from linestring if missing)

    Process:
    1. Backfill missing segment centers from segment linestrings
    2. Exact/edge-safe mapping by ST_Covers
    3. Fallback mapping by nearest location polygon

    Returns:
        int: Number of segments mapped in this run
    """
    logger.info("[segment-location-mapper] Starting robust spatial mapping...")

    try:
        geometry_column = _resolve_location_geometry_column(engine)

        with engine.connect() as conn:
            before_unmapped = _count_unmapped_segments(conn)
            logger.info(
                "[segment-location-mapper] Unmapped segments before mapping: %s",
                before_unmapped,
            )

            backfilled = _backfill_missing_segment_centers(conn)
            if backfilled > 0:
                logger.info(
                    "[segment-location-mapper] Backfilled %s missing geometry_center values",
                    backfilled,
                )

            covered = _map_by_polygon_coverage(conn, geometry_column)
            logger.info(
                "[segment-location-mapper] ST_Covers mapped %s segments",
                covered,
            )

            nearest = _map_by_nearest_polygon(conn, geometry_column)
            logger.info(
                "[segment-location-mapper] Nearest fallback mapped %s segments",
                nearest,
            )

            after_unmapped = _count_unmapped_segments(conn)
            conn.commit()

        mapped_now = max(0, before_unmapped - after_unmapped)

        if after_unmapped > 0:
            logger.warning(
                "[segment-location-mapper] Remaining unmapped segments: %s (likely missing geometry_center)",
                after_unmapped,
            )
        else:
            logger.info("[segment-location-mapper] ✓ All segments now have location_key")

        logger.info(
            "[segment-location-mapper] Total mapped in this run: %s",
            mapped_now,
        )
        return mapped_now
    except Exception as e:
        logger.error(f"[segment-location-mapper] ✗ Spatial mapping failed: {e}")
        raise
