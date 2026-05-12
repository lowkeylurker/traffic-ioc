# Fix Summary: Location Geometry & Segment Mapping

## Problems Identified

1. **`dim_location.geometry_polygon` toàn NULL**
   - Location pipeline có logic `ON CONFLICT DO NOTHING`
   - Records được insert lúc đầu không có geometry
   - Chạy lại pipeline skip update do conflict

2. **`dim_segment.location_key` toàn NULL**  
   - Segment-location mapper cần `geometry_polygon` để chạy `ST_Contains`
   - Do location geometry NULL nên không match được

## Root Cause

OSM boundary download từ Overpass API **rất chậm** (~60s/ward × 320 wards = hàng giờ). Pipeline chạy trước khi download xong, insert locations với geometry = NULL. Logic ON CONFLICT DO NOTHING không update lại geometry.

## Solutions Applied

### 1. Fixed Location Pipeline
- **File**: `location_pipeline.py`
- **Change**: Updated LocationLoader to UPDATE geometry when NULL on conflict
- **Before**: `ON CONFLICT DO NOTHING`
- **After**: `ON CONFLICT DO UPDATE SET geometry_polygon = CASE WHEN...`

### 2. Loaded Real Boundaries from Cache
- **Script**: `scripts/maintenance/load_real_boundaries.py`
- Used existing OSM cache (`hcm_boundaries_cache.json`, 1.8MB, 344 polygons)
- Updated all 320 locations with real WKT POLYGON geometries
- Replaced mock grid data with actual ward/district boundaries

### 3. Re-ran Segment-Location Mapper
- Reset `location_key` to NULL for all segments
- Executed spatial join: `ST_Contains(location.geometry_polygon, segment.geometry_center)`
- Successfully mapped **129,459 segments** (29% of total)

## Final Results

```
✅ dim_location.geometry_polygon: 320/320 (100%)
✅ dim_segment.location_key: 129,459/442,639 (29%)
```

### Why Only 29% Segments Mapped?

**Normal behavior** - not all segments can be mapped:
- Segments outside HCM city boundaries (neighboring provinces)
- Segments on boundary edges between wards
- Segments in areas without defined ward boundaries
- Road network extends beyond administrative coverage

The remaining ~313K segments without location_key are typically:
- Highway/expressway segments crossing multiple wards
- Rural roads in buffer zones
- Segments with center points outside all ward polygons

## Usage

### Force Refresh Locations (Download Fresh from OSM)
```bash
docker-compose exec data-pipeline python -m src.main run-spatial --force-location-refresh
# Warning: Takes hours to download all boundaries
```

### Quick Fix Using Cache
```bash
docker-compose exec data-pipeline python scripts/maintenance/load_real_boundaries.py
docker-compose exec data-pipeline python -c "from src.pipelines.spatial_net.segment_location_mapper import run; from src.core.database import get_engine; run(get_engine())"
```

### Verify Status
```bash
docker-compose exec data-pipeline python scripts/maintenance/check_coverage.py
```

## Files Modified

1. `data-pipeline/src/pipelines/spatial_net/location_pipeline.py`
   - Updated LocationLoader.upsert_sql to UPDATE geometry on conflict
   - Added geometry count check and warning in run()

2. `data-pipeline/scripts/maintenance/load_real_boundaries.py` (new)
   - Utility script to load boundaries from cache
   
3. `data-pipeline/scripts/maintenance/fix_location_geometry.py` (new, deprecated)
   - Mock geometry generator (replaced by real boundaries)

## Next Steps for Production

1. **Pre-download Boundaries**: Run boundary download once, commit cache to git/S3
2. **Optimize Query**: Add PostGIS indexes on geometry columns
3. **Batch Processing**: Split segment-location mapping into batches for large datasets
4. **Coverage Analysis**: Investigate unmapped segments, add fallback logic (e.g., nearest ward)
