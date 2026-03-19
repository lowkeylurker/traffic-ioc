"""Debug script to check OSM boundaries download."""
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
