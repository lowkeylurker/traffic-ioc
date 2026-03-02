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

from sqlalchemy import Engine

from src.core.logger import get_logger
from src.domain.geo.hcm_locations import get_all_locations, get_total_count
from src.domain.geo.osm_boundaries import download_hcm_boundaries
from src.pipelines.base import BaseLoader, BaseTransformer


def _generate_location_key(ward: str, district: str) -> int:
    """Sinh location_key (BIGINT) từ ward+district hash."""
    raw = f"{ward}_{district}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:15], 16)


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
        
        for ward, district in all_locations:
            location_key = _generate_location_key(ward, district)
            
            # Get boundary polygon (WKT format)
            boundary_wkt = boundaries.get((ward, district))
            if not boundary_wkt:
                # Fallback to district boundary if ward not available
                boundary_wkt = boundaries.get((district, district))
            
            records.append(
                {
                    "location_key": location_key,
                    "ward": ward,
                    "district": district,
                    "city": "Hồ Chí Minh",
                    "geometry_polygon": boundary_wkt,  # WKT format, PostGIS will parse it
                    "record_timestamp": now,
                }
            )
        
        self.logger.info(f"Generated {len(records)} dim_location records with geometry")
        return records


# ═══════════════════════════════════════════════════════════
# LOADER
# ═══════════════════════════════════════════════════════════


class LocationLoader(BaseLoader):
    TABLE_NAME = "dim_location"
    CONFLICT_KEYS = ["location_key"]
    UPDATE_COLUMNS = []  # DO NOTHING
    BATCH_SIZE = 100

    def load(self, records: list[dict]) -> int:
        return self._upsert_batch(records)


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

    transformer = LocationTransformer()
    records = transformer.transform()

    loader = LocationLoader(engine)
    count = loader.load(records)
    logger.info(f"Loaded {count} records → dim_location")
    return count
