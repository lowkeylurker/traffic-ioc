"""Quick fix: Populate dim_location with mock geometries for testing.

This script creates simple bounding box geometries for each location
instead of downloading from OSM (which takes hours).

For production: Run with real OSM boundaries using location pipeline.
"""
from pathlib import Path
import sys

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.database import get_engine
from src.domain.geo.hcm_locations import get_all_locations
from src.pipelines.spatial_net.location_pipeline import _generate_location_key

engine = get_engine()

print("🗺️  Creating mock geometries for dim_location...")

# HCM bounding box (simplified - District 1 area as reference)
BASE_LON = 106.6
BASE_LAT = 10.7
GRID_SIZE = 0.01  # ~1km per grid cell

all_locations = get_all_locations()

with engine.connect() as conn:
    updated = 0
    for i, (ward, district) in enumerate(all_locations):
        location_key = _generate_location_key(ward, district)
        
        # Create a simple rectangular polygon around a grid position
        row = i // 20
        col = i % 20
        
        lon1 = BASE_LON + (col * GRID_SIZE)
        lat1 = BASE_LAT + (row * GRID_SIZE)
        lon2 = lon1 + GRID_SIZE
        lat2 = lat1 + GRID_SIZE
        
        # Create WKT polygon (rectangle)
        wkt = f"POLYGON(({lon1} {lat1}, {lon2} {lat1}, {lon2} {lat2}, {lon1} {lat2}, {lon1} {lat1}))"
        
        # Update geometry_polygon where it's NULL
        result = conn.execute(
            text("""
                UPDATE dim_location
                SET geometry_polygon = ST_GeomFromText(:wkt, 4326)
                WHERE location_key = :location_key
                  AND geometry_polygon IS NULL
            """),
            {"location_key": location_key, "wkt": wkt}
        )
        
        if result.rowcount > 0:
            updated += 1
    
    conn.commit()
    print(f"✅ Updated {updated} locations with mock geometries")

# Verify
with engine.connect() as conn:
    result = conn.execute(
        text("SELECT COUNT(*) FROM dim_location WHERE geometry_polygon IS NOT NULL")
    )
    count = result.scalar()
    print(f"✅ Total locations with geometry: {count}")

print("\n⚠️  NOTE: These are MOCK geometries for testing only!")
print("   For production, run: docker-compose exec data-pipeline python -m src.main run-spatial --force-location-refresh")
