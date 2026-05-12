"""Location Dimension Pipeline.

Populate dim_location from complete HCM City administrative boundaries.
Covers all 24 districts (19 urban + 5 rural) with ~312 wards/communes.

Boundaries loaded from OpenStreetMap (Overpass API) for spatial queries.
Each location has geometry_polygon for ST_Contains operations with segment centers.

Đây là danh mục tĩnh → DO NOTHING on conflict.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from shapely import wkt as shapely_wkt
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from sqlalchemy import Engine, text

from src.core.logger import get_logger
from src.domain.geo.hcm_locations import get_all_locations, get_total_count
from src.domain.geo.osm_boundaries import download_hcm_boundaries
from src.pipelines.base import BaseLoader, BaseTransformer


def _resolve_geometry_column(engine: Engine) -> str:
    """Resolve geometry column name for dim_location across schema versions."""
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

    alter_sql = text(
        "ALTER TABLE dim_location ADD COLUMN geometry_polygon GEOMETRY(Geometry, 4326)"
    )
    with engine.connect() as conn:
        conn.execute(alter_sql)
        conn.commit()
    return "geometry_polygon"


def _is_location_catalog_ready(
    engine: Engine,
    geometry_column: str,
    expected_count: int,
) -> bool:
    """Check whether dim_location already has a complete boundary catalog."""
    query = text(f"""
        SELECT
            COUNT(*) AS total_count,
            COUNT({geometry_column}) AS geometry_count
        FROM dim_location
    """)
    with engine.connect() as conn:
        total_count, geometry_count = conn.execute(query).fetchone()

    return total_count >= expected_count and geometry_count >= expected_count


def _generate_location_key(ward: str, district: str) -> int:
    """Sinh location_key (BIGINT) từ ward+district hash."""
    raw = f"{ward}_{district}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15], 16)


def _validate_and_convert_geometry(wkt_string: str | None, ward: str, district: str) -> str | None:
    """Validate geometry and convert to Polygon/MultiPolygon if needed.
    
    Args:
        wkt_string: WKT geometry string from OSM
        ward: Ward name for logging
        district: District name for logging
        
    Returns:
        Valid Polygon/MultiPolygon WKT string, or None if invalid
    """
    if not wkt_string:
        return None
    
    try:
        geom = shapely_wkt.loads(wkt_string)
        
        # Accept Polygon and MultiPolygon as-is
        if isinstance(geom, (Polygon, MultiPolygon)):
            return wkt_string
        
        # Convert LineString to Polygon using buffer
        if isinstance(geom, LineString):
            # Buffer by ~50 meters (approximate, in degrees at HCM lat/lon)
            # 1 degree ≈ 111 km, so 50m ≈ 0.00045 degrees
            buffered = geom.buffer(0.00045)
            if isinstance(buffered, (Polygon, MultiPolygon)):
                logger = get_logger(__name__)
                logger.warning(
                    f"Converted LineString to Polygon for {ward}, {district} using buffer"
                )
                return buffered.wkt
        
        # Skip Point and other geometry types
        logger = get_logger(__name__)
        logger.warning(
            f"Skipping unsupported geometry type {geom.geom_type} for {ward}, {district}"
        )
        return None
        
    except Exception as e:
        logger = get_logger(__name__)
        logger.error(f"Failed to parse geometry for {ward}, {district}: {e}")
        return None


# ═══════════════════════════════════════════════════════════
# TRANSFORMER
# ═══════════════════════════════════════════════════════════


class LocationTransformer(BaseTransformer):
    """Sinh dim_location rows từ catalog + OSM boundaries."""

    def transform(self, raw_data: None = None) -> list[dict]:
        now = datetime.utcnow()
        records = []
        
        # Get all locations from HCM catalog
        all_locations = get_all_locations()
        stats = get_total_count()
        
        self.logger.info(
            f"Loading HCM locations: {stats['districts']} districts "
            f"({stats['urban_districts']} urban, {stats['rural_districts']} rural), "
            f"{stats['wards']} wards/communes"
        )
        
        # Download boundary polygons from OpenStreetMap
        self.logger.info("Downloading boundary geometries from OpenStreetMap...")
        boundaries = download_hcm_boundaries()
        self.logger.info(f"Downloaded {len(boundaries)} boundary polygons")
        
        skipped_count = 0
        for ward, district in all_locations:
            location_key = _generate_location_key(ward, district)
            
            # Get boundary polygon (WKT format)
            boundary_wkt = boundaries.get((ward, district))
            if not boundary_wkt:
                # Fallback to district boundary if ward not available
                boundary_wkt = boundaries.get((district, district))
            
            # Validate and convert geometry to Polygon/MultiPolygon
            validated_wkt = _validate_and_convert_geometry(boundary_wkt, ward, district)
            if not validated_wkt:
                skipped_count += 1
                # Still insert record but without geometry
                validated_wkt = None
            
            records.append(
                {
                    "location_key": location_key,
                    "ward": ward,
                    "district": district,
                    "city": "Hồ Chí Minh",
                    "geometry_wkt": validated_wkt,
                    "record_timestamp": now,
                }
            )
        
        if skipped_count > 0:
            self.logger.warning(
                f"Skipped {skipped_count} locations with invalid/unsupported geometry"
            )
        
        self.logger.info(f"Generated {len(records)} dim_location records with geometry")
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class LocationLoader(BaseLoader):
    """UPSERT dim_location (có PostGIS geometry → raw SQL)."""

    TABLE_NAME = "dim_location"
    CONFLICT_KEYS = ["location_key"]
    UPDATE_COLUMNS = []  # Handled in custom SQL
    BATCH_SIZE = 100

    def __init__(self, engine: Engine, geometry_column: str) -> None:
        super().__init__(engine)
        self.geometry_column = geometry_column

    @property
    def upsert_sql(self) -> str:
        return f"""
            INSERT INTO dim_location (location_key, ward, district, city, {self.geometry_column}, record_timestamp)
            VALUES (:location_key, :ward, :district, :city,
                    CASE 
                        WHEN :geometry_wkt IS NOT NULL THEN ST_GeomFromText(:geometry_wkt, 4326)
                        ELSE NULL 
                    END,
                    :record_timestamp)
            ON CONFLICT (location_key) DO UPDATE SET
                {self.geometry_column} = CASE
                    WHEN EXCLUDED.{self.geometry_column} IS NOT NULL AND dim_location.{self.geometry_column} IS NULL
                    THEN EXCLUDED.{self.geometry_column}
                    ELSE dim_location.{self.geometry_column}
                END,
                record_timestamp = EXCLUDED.record_timestamp
        """

    def load(self, records: list[dict]) -> int:
        return self._upsert_raw_sql(self.upsert_sql, records)


# ═══════════════════════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════════════════════


def run(engine: Engine, **kwargs) -> int:
    """UPSERT dim_location for all HCM City wards/communes.
    
    Loads 24 districts (19 urban + 5 rural) with ~312 wards.

    Returns:
        int: Số record đã upsert.
    """
    logger = get_logger("location_pipeline")

    force_refresh = kwargs.get("force_refresh", False)

    geometry_column = _resolve_geometry_column(engine)
    expected_count = get_total_count()["wards"]

    # Check if geometry is populated
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT COUNT(*) FROM dim_location WHERE {geometry_column} IS NOT NULL")
        )
        geometry_count = result.scalar()
    
    if not force_refresh and _is_location_catalog_ready(
        engine,
        geometry_column,
        expected_count,
    ):
        logger.info(
            f"dim_location already ready ({expected_count} records, {geometry_count} with geometry); skip refresh"
        )
        return 0
    
    if geometry_count < expected_count:
        logger.warning(
            f"dim_location has {geometry_count}/{expected_count} geometries populated. "
            "Force refresh to download boundaries from OSM (may take hours)."
        )

    transformer = LocationTransformer()
    records = transformer.transform()

    loader = LocationLoader(engine, geometry_column=geometry_column)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → dim_location")
    return count
