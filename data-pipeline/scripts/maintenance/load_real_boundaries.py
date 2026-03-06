"""Load REAL HCM boundaries from cache and update dim_location."""
from pathlib import Path
import sys

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.database import get_engine
from src.domain.geo.osm_boundaries import download_hcm_boundaries
from src.pipelines.spatial_net.location_pipeline import _generate_location_key

engine = get_engine()

print("🗺️  Loading HCM boundaries from cache...")
boundaries = download_hcm_boundaries(use_cache=True)

print(f"✅ Loaded {len(boundaries)} real boundary polygons from OSM cache")

if not boundaries:
    print("❌ Cache is empty! Run location pipeline with force_refresh to download from OSM.")
    exit(1)

print("\n📍 Updating dim_location with real geometries...")

with engine.connect() as conn:
    updated = 0
    skipped_no_match = 0
    
    for (ward, district), wkt in boundaries.items():
        if not wkt:
            continue
            
        location_key = _generate_location_key(ward, district)
        
        # Update geometry_polygon (overwrite even if exists, to replace mock data)
        result = conn.execute(
            text("""
                UPDATE dim_location
                SET geometry_polygon = ST_GeomFromText(:wkt, 4326)
                WHERE location_key = :location_key
            """),
            {"location_key": location_key, "wkt": wkt}
        )
        
        if result.rowcount > 0:
            updated += 1
        else:
            skipped_no_match += 1
    
    conn.commit()
    print(f"✅ Updated {updated} locations with real OSM geometries")
    if skipped_no_match > 0:
        print(f"⚠️  Skipped {skipped_no_match} boundaries (no matching location_key in dim_location)")

# Verify
with engine.connect() as conn:
    result = conn.execute(
        text("SELECT COUNT(*) FROM dim_location WHERE geometry_polygon IS NOT NULL")
    )
    count = result.scalar()
    print(f"\n📊 Total locations with geometry: {count}")

print("\n✅ Ready to run segment-location mapper!")
print("   Run: docker-compose exec data-pipeline python -m src.main run-spatial --skip-location --skip-osm --skip-corridor")
