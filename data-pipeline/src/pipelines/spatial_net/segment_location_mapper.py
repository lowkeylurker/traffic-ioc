"""Segment-Location Mapper Pipeline.

Maps each segment (dim_segment) to its containing location (dim_location) using spatial queries.

Executes spatial join: ST_Contains(location.geometry_polygon, segment.geometry_center)
Updates dim_segment.location_key with the matching location.

This pipeline runs AFTER location_pipeline and osm_pipeline to ensure:
- All locations have geometry_polygon loaded
- All segments have geometry_center populated
"""

from __future__ import annotations

from sqlalchemy import Engine, text

from src.core.logger import get_logger


logger = get_logger(__name__)


def _update_segment_locations(engine: Engine) -> int:
    """Spatial join: match segments to locations by ST_Contains.
    
    For each segment with location_key = NULL:
    - Find location where ST_Contains(location.geometry_polygon, segment.geometry_center)
    - Update segment.location_key with matching location_key
    
    Args:
        engine: SQLAlchemy engine for database connection
        
    Returns:
        Number of segments updated
        
    Raises:
        sqlalchemy.exc.DatabaseError: Database query error
    """
    query = text("""
        -- Update segment location_key via spatial join
        UPDATE dim_segment ds
        SET location_key = dl.location_key
        FROM dim_location dl
        WHERE ds.location_key IS NULL
          AND ST_Contains(
            dl.geometry_polygon,
            ds.geometry_center
          );
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query)
        count = result.rowcount
        conn.commit()
        return count


def run(engine: Engine, **kwargs) -> int:
    """Map all segments to locations using spatial join.
    
    Prerequisites:
    - dim_location must be populated with geometry_polygon
    - dim_segment must be populated with geometry_center
    
    Process:
    1. Find segments with location_key = NULL
    2. Spatial join: ST_Contains(location.geometry, segment.center)
    3. Update dim_segment.location_key
    
    Args:
        engine: SQLAlchemy database engine
        
    Returns:
        int: Number of segments updated
    """
    logger.info("[segment-location-mapper] Starting spatial join...")
    
    try:
        count = _update_segment_locations(engine)
        logger.info(f"[segment-location-mapper] ✓ Mapped {count} segments to locations")
        return count
    except Exception as e:
        logger.error(f"[segment-location-mapper] ✗ Spatial join failed: {e}")
        raise
