"""Debug script to check OSM boundaries download."""
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.domain.geo.osm_boundaries import download_hcm_boundaries

print("🗺️  Downloading HCM boundaries from OpenStreetMap...")
boundaries = download_hcm_boundaries(use_cache=False)

print(f"\n✅ Downloaded {len(boundaries)} boundary polygons")

if boundaries:
    print("\n📍 Sample boundaries (first 5):")
    for i, (key, wkt) in enumerate(list(boundaries.items())[:5], 1):
        ward, district = key
        wkt_preview = wkt[:100] if wkt else "NULL"
        print(f"  {i}. {ward}, {district}: {wkt_preview}...")
else:
    print("\n❌ No boundaries downloaded! Check OSM API or network connection.")
