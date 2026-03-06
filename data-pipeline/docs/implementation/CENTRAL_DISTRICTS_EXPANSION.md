# ETL EXPANSION FOR CENTRAL DISTRICTS – IMPLEMENTATION GUIDE

**Date:** March 5, 2026  
**Status:** ✅ Completed  
**Scope:** Expand ETL coverage from District 1 to 8 central districts

---

## 1. OVERVIEW

Previously, the ETL pipeline was limited to **District 1 (Quận 1)** for MVP testing.  
This update expands the coverage to **Central Districts of Ho Chi Minh City**:

- **Quận 1** (District 1)
- **Quận 3** (District 3)
- **Quận 4** (District 4)
- **Quận 5** (District 5)
- **Quận 10** (District 10)
- **Quận 11** (District 11)
- **Quận Bình Thạnh** (Binh Thanh District)
- **Quận Phú Nhuận** (Phu Nhuan District)

**Total Coverage Area:** ~22km × 17km (expanded from 6km × 6km)

---

## 2. CHANGES IMPLEMENTED

### 2.1 Geographic Constants (`src/domain/geo/constants.py`)

Added new bounding box definitions:

```python
# Central districts combined bbox (all 8 districts)
BBOX_CENTRAL_DISTRICTS = {
    "min_lon": 106.600,  # West (Quận 11)
    "min_lat": 10.720,   # South (Quận 5)
    "max_lon": 106.830,  # East (Bình Thạnh)
    "max_lat": 10.890,   # North (Phú Nhuận)
}

# Individual district bboxes (optional, for future fine-grained filtering)
BBOX_DISTRICT_3, BBOX_DISTRICT_4, BBOX_DISTRICT_5, 
BBOX_DISTRICT_10, BBOX_DISTRICT_11, BBOX_BINH_THANH, BBOX_PHU_NHUAN
```

### 2.2 New CLI Commands (`src/main.py`)

| Command | Purpose | Coverage |
|---------|---------|----------|
| `run-osm-district1` | **[Existing]** Download OSM network for D1 | 6km × 6km |
| `run-osm-central-districts` | **[NEW]** Download OSM network for central districts | 22km × 17km |
| `run-realtime` | **[Existing]** Real-time ETL (weather, traffic, incidents) | All data |
| `run-realtime-central-districts` | **[NEW]** Real-time ETL filtered by central districts bbox | Filtered |
| `run-batch` | **[Existing]** Nightly batch (baseline, corridor) | All data |
| `run-corridor-central-districts` | **[NEW]** Corridor performance for central districts only | Filtered |

### 2.3 Segment Points Loading Enhancement

Updated `_load_segment_points()` function to support optional bbox filtering:

```python
def _load_segment_points(
    engine: Engine,
    limit: int = _MAX_SEGMENTS_PER_CYCLE,
    bbox: dict | None = None,  # NEW parameter
) -> Tuple[list, list, dict, dict]:
```

Added `_SEGMENT_QUERY_WITH_BBOX` for spatial filtering:

```sql
WHERE  s.geometry_center IS NOT NULL
  AND  ST_Y(s.geometry_center) >= :min_lat
  AND  ST_Y(s.geometry_center) <= :max_lat
  AND  ST_X(s.geometry_center) >= :min_lon
  AND  ST_X(s.geometry_center) <= :max_lon
```

---

## 3. AFFECTED PIPELINES

### 3.1 OSM Network Pipeline (`src/pipelines/spatial_net/osm_pipeline.py`)

- **Status:** ✅ Already supports bbox parameter
- **Usage:** `run_osm(engine, bbox=BBOX_CENTRAL_DISTRICTS)`
- **Impact:** Downloads network nodes/edges within bbox

### 3.2 Traffic Flow Pipeline (`src/pipelines/real_time/traffic_pipeline.py`)

- **Status:** ✅ Supports bbox filtering via segment loading
- **Usage:** Filtered via `_load_segment_points(bbox=...)`
- **Data Table:** `fact_traffic_flow` (3 fields affected)
  - `pcu_volume`
  - `traffic_index`
  - `congestion_level`

### 3.3 Incident Pipeline (`src/pipelines/real_time/incident_pipeline.py`)

- **Status:** ✅ Already supports bbox parameter
- **Usage:** `run_incident(engine, bbox=BBOX_CENTRAL_DISTRICTS)`
- **Data Table:** `fact_incident`

### 3.4 Corridor Performance Pipeline (`src/pipelines/ml_features/corridor_pipeline.py`)

- **Status:** ✅ Already supports bbox parameter
- **Usage:** `run_corr(engine, bbox=BBOX_CENTRAL_DISTRICTS)`
- **Data Table:** `fact_corridor_performance`

---

## 4. USAGE EXAMPLES

### 4.1 Quick Start (One-Time Setup)

```bash
# 1. Download OSM network for central districts
python -m src.main run-osm-central-districts

# 2. Run real-time ETL once
python -m src.main run-realtime-central-districts

# 3. Calculate corridor performance
python -m src.main run-corridor-central-districts
```

### 4.2 Scheduled Execution (Recommended)

```bash
# Every 15 minutes: Real-time data
0,15,30,45 * * * * cd /path && python -m src.main run-realtime-central-districts

# Every night at 23:00: Batch analytics
0 23 * * * cd /path && python -m src.main run-corridor-central-districts
```

### 4.3 Full Pipeline Run

```bash
# Run all phases (static → spatial → realtime → batch)
python -m src.main run-all
# Note: run-all still uses BBOX_HCM (full HCM) for backward compatibility
```

---

## 5. DATA MODEL UPDATES

### 5.1 Affected Tables

| Table | Affected Columns | Impact |
|-------|-----------------|--------|
| `fact_traffic_flow` | `pcu_volume`, `traffic_index`, `congestion_level` | Now filtered by central districts bbox |
| `fact_incident` | All | Now filtered by central districts bbox |
| `fact_corridor_performance` | All | Now filtered by central districts bbox |
| `dim_segment` | None (reference) | Filtered by spatial query with bbox |

### 5.2 Data Retention

- **Old data (District 1 only):** Retained in DB ✅
- **New data (Central districts):** New records created separately
- **Backward compatibility:** Existing reports/views not affected

---

## 6. VALIDATION & TESTING

### 6.1 Pre-Deployment Checks

```bash
# 1. Check geo constants are loaded
python -c "from src.domain.geo.constants import BBOX_CENTRAL_DISTRICTS; print(BBOX_CENTRAL_DISTRICTS)"

# 2. Verify CLI commands exist
python -m src.main --help | grep central-districts

# 3. Test spatial query with bbox
python -m src.main run-osm-central-districts --dry-run
```

### 6.2 Post-Deployment Validation

```sql
-- Count segments in central districts
SELECT COUNT(*) FROM dim_segment s
WHERE ST_Y(s.geometry_center) >= 10.720 AND ST_Y(s.geometry_center) <= 10.890
  AND ST_X(s.geometry_center) >= 106.600 AND ST_X(s.geometry_center) <= 106.830;

-- Count traffic flow records for central districts
SELECT COUNT(*) FROM fact_traffic_flow
WHERE date_key >= 20260305;

-- Verify corridor performance filtered by bbox
SELECT DISTINCT district FROM fact_corridor_performance LIMIT 10;
```

---

## 7. CONFIGURATION REFERENCE

### 7.1 Bounding Boxes (WGS84 – lat/lon)

| Name | min_lon | min_lat | max_lon | max_lat | Area |
|------|---------|---------|---------|---------|------|
| **Central Districts** | 106.600 | 10.720 | 106.830 | 10.890 | 22×17 km |
| District 1 | 106.663 | 10.743 | 106.723 | 10.803 | 6×6 km |
| District 3 | 106.660 | 10.760 | 106.720 | 10.820 | ~6 km |
| District 4 | 106.690 | 10.750 | 106.790 | 10.850 | ~11 km |
| District 5 | 106.650 | 10.720 | 106.750 | 10.810 | ~11 km |
| District 10 | 106.650 | 10.790 | 106.733 | 10.870 | ~9 km |
| District 11 | 106.600 | 10.780 | 106.720 | 10.880 | ~8 km |
| Binh Thanh | 106.720 | 10.780 | 106.830 | 10.890 | ~12 km |
| Phu Nhuan | 106.680 | 10.810 | 106.780 | 10.880 | ~11 km |

### 7.2 Key Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `_MAX_SEGMENTS_PER_CYCLE` | 25 | Max segments per 15-min TomTom calls (free tier) |
| `TomTom API calls/day` | 2,500 | Free tier limit |
| `96 cycles/day` | 25 segments | 2500 ÷ 96 ≈ 26 per cycle |
| `OSM coverage time` | ~60-90 sec | For central districts |
| `Real-time cycle` | 15 min | Recommended interval |

---

## 8. MIGRATION NOTES

### 8.1 Backward Compatibility

✅ **Fully backward compatible:**
- Existing `run-osm-district1` command unchanged
- `run-realtime` command unchanged (uses all data)
- `run-batch` command unchanged (uses all data)
- Old District 1 data retained in database

### 8.2 Breaking Changes

❌ **None identified**

---

## 9. FUTURE ENHANCEMENTS

### 9.1 Planned Improvements

1. **District-specific commands:** Add `run-osm-district3`, `run-realtime-district5`, etc.
2. **Multi-district aggregation:** Combine results from multiple districts
3. **Sidebar analysis:** Traffic patterns across district boundaries
4. **Real-time monitoring dashboard:** Display central districts data

### 9.2 Potential Extensions

- Expand to **all 24 districts** using `BBOX_HCM`
- Add **outer districts** (Thu Duc, Can Tho) with separate bboxes
- Implement **district-wise performance tracking** (trend analysis)

---

## 10. REFERENCE LINKS

### Code Files Modified

- [constants.py](src/domain/geo/constants.py) – Geographic boundaries
- [main.py](src/main.py) – CLI commands + segment loading
- [utils/__init__.py](src/utils/__init__.py) – Export constants

### Related Files

- [incident_pipeline.py](src/pipelines/real_time/incident_pipeline.py) – Incident extraction
- [traffic_pipeline.py](src/pipelines/real_time/traffic_pipeline.py) – Traffic flow ETL
- [corridor_pipeline.py](src/pipelines/ml_features/corridor_pipeline.py) – Corridor performance
- [osm_pipeline.py](src/pipelines/spatial_net/osm_pipeline.py) – OSM network download

### Specifications

- [spec_3_data_contracts.md](specs/spec_3_data_contracts.md) – Data structure definitions
- [spec_4_business_logic.md](specs/spec_4_business_logic.md) – Calculation formulas
- [seed_context_fact_traffic_flow_q1.md](specs/seed_context_fact_traffic_flow_q1.md) – Traffic flow specs

---

## 11. TROUBLESHOOTING

### Issue: No segments loaded for central districts

```bash
# Check if spatial index exists
SELECT * FROM pg_indexes WHERE tablename = 'dim_segment';

# Verify geometry data exists
SELECT COUNT(*) FROM dim_segment WHERE geometry_center IS NOT NULL;

# Test bbox query manually
psql -c "SELECT COUNT(*) FROM dim_segment s 
WHERE ST_Y(s.geometry_center) >= 10.720 AND ST_Y(s.geometry_center) <= 10.890
  AND ST_X(s.geometry_center) >= 106.600 AND ST_X(s.geometry_center) <= 106.830;"
```

### Issue: TomTom API rate limit exceeded

- Reduce `_MAX_SEGMENTS_PER_CYCLE` from 25 to 15-20
- Increase cycle interval from 15 min to 30 min
- Consider upgrading to paid TomTom plan

### Issue: Corridor performance 0% for new segments

- Ensure `fact_traffic_flow` records exist first
- Run traffic pipeline before corridor pipeline
- Check that segments have matching traffic data

---

**Last Updated:** March 5, 2026  
**Next Review:** Q2 2026 (after 1 month of operation)

---
