## Flow Tile Adaptive Scanning Pipeline

**Purpose**: Reduce TomTom API calls by 60-80% while maintaining high detection accuracy for traffic congestion across all of HCM city.

---

## Architecture Overview

### Traditional Approach
```
All ~2,500 segments → Traffic Flow API → Full coverage (expensive, ~2,500 req/cycle)
```

### New Adaptive Approach
```
Flow Tile API (zoom 15)  →  Detect hotspots  →  Map to segments  →  Detail scan hotspots
   ~4-8 tiles (~40 req)     Traffic Index > 0.10    PostGIS ST_DWithin     ~50-200 req/cycle
                                                                              60-80% savings ✓
```

---

### Budget Breakdown (per 15-min cycle)
```
Total daily budget:     130 keys × 2,500 req/day = 325,000 req/day
Cycles per day:         77 cycles (03:00-22:00 every 15 min)
Budget per cycle:       ~4,220 requests

Allocation:
  - Flow Tile coarse:   ~40 req (10 tiles × 4 tries avg)
  - Detail hotspots:    ~2,700 req (60% of budget, ~50-200 segments)
  - Baseline rotation:  ~850 req (20% of budget, non-hot segments)
  - Incident reserve:   ~630 req (15% of budget, emergency)
```

---

## Pipeline Stages

### Stage 1: Flow Tile Extraction
**Module**: `flow_tile_extractor.py`

- Compute Web Mercator tile coordinates for HCM bbox at zoom 15
- Call TomTom Traffic Flow Tile API for each tile (4-8 tiles typically)
- Return raw tile responses with segment-level flow data per tile
- **Output**: `dict[(z,x,y)] = tile_response`

### Stage 2: Hotspot Detection
**Module**: `hotspot_detector.py`

- Analyze each tile response to compute tile-level avg speed
- Calculate `traffic_index = 1 - (avg_speed / freeflow_speed)`
- Identify hotspots where `traffic_index > FLOW_TILE_THRESHOLD` (0.10)
- **Output**: `set[Hotspot]` with `{tile_z, tile_x, tile_y, traffic_index, flow_speed, ...}`

### Stage 3: Segment Mapping (PostGIS)
**Module**: `segment_mapper.py`

- For each hotspot tile, convert tile bounds to lat/lon bbox
- Query `dim_segment` table using PostGIS `ST_DWithin()`:
  ```sql
  SELECT segment_id, geometry_center (lat, lon)
  FROM dim_segment
  WHERE ST_DWithin(geometry_center, tile_bbox, buffer_m)
  LIMIT max_segments_per_tile
  ```
- Return list of segment coordinates within hotspot tiles
- **Output**: `dict[segment_id] = [(lat, lon), ...]`

### Stage 4: Detail Traffic Flow Extraction
**Module**: `traffic_pipeline.py` (reused)

- For each segment in hotspot tiles, call TomTom Traffic Flow API
- Extract speed, direction, reliability, incident references
- **Output**: Raw TomTom responses per segment

### Stage 5: Transformation & Metrics
**Module**: `traffic_pipeline.py` (reused)

- Validate and transform responses
- Calculate derived metrics:
  - `traffic_index = 1 - (current_speed / free_flow_speed)`
  - `los_level` (Level of Service A-F per HCM 2010)
  - `congestion_level` (0-5 integer classification)
  - `quality_flag` (data quality assessment)
- **Output**: Structured records ready for loading

### Stage 6: Load & Mark Free-Flow
**Module**: `traffic_pipeline.py` + `segment_mapper.py`

- UPSERT detail traffic data to `fact_traffic_flow` for hotspot segments
- Mark non-hotspot segments as `free_flow` (special flag in fact_traffic_flow)
- No detail API calls made for non-hotspot segments
- **Output**: Updated `fact_traffic_flow` table

---

## Usage

### Run Adaptive Flow Tile Scan (Manual)
```bash
cd data-pipeline
docker compose exec data-pipeline python -m src.main run-flow-tile-scan
```

### Expected Output
```
╭────────────────────────────────────────────────────────╮
│ 🗺️ FLOW TILE ADAPTIVE SCAN                            │
│ Coarse tiles → Hotspots → Detail segments             │
╰────────────────────────────────────────────────────────╯

Step 1/5: Extracting flow tiles...
  Extracting flow tiles for HCM: 6 tiles [pool(130 keys), max_workers=4]
  Extracted 6/6 flow tiles (skipped=0)

Step 2/5: Detecting hotspots...
  Detecting hotspots (threshold=0.10) across 6 tiles
  Detected 2 hotspots

Step 3/5: Mapping hotspot tiles to detail segments...
  Tile (15,27301,13755) → 45 segments (buffer=50m)
  Tile (15,27302,13756) → 38 segments (buffer=50m)
  Mapped 2 hotspots → 83 unique segments

Step 4/5: Extracting detail traffic flow for 83 segments...
  Extracting traffic flow for 83 segments [pool(130 keys), max_workers=8]
  Extracted 75/83 responses (skipped=8)

Step 5/5: Transforming and loading to database...
  Loaded 75 records

Marked 2417 non-hotspot segments as free_flow

╭────────────────────────────────────────────────────────╮
│ ✅ FLOW TILE SCAN COMPLETE (45.3s)                    │
│ Tiles extracted: 6                                     │
│ Hotspots detected: 2                                   │
│ Detail segments scanned: 83                            │
│ Non-hotspots marked free_flow: 2417                    │
│ Errors: 0                                              │
╰────────────────────────────────────────────────────────╯
```

---

## Performance Characteristics

### Latency
- **Coarse tile extraction**: ~1-2 seconds for 6-8 tiles
- **Hotspot detection**: <1 second for all tiles
- **PostGIS segment mapping**: ~2-3 seconds for all hotspots
- **Detail traffic extraction**: ~20-40 seconds for 50-200 segments (parallel, 8 workers)
- **Transform & load**: ~5-10 seconds
- **Total cycle**: ~30-60 seconds (vs ~120-180s for full segment scan)

### API Budget Impact
- **Before**: ~2,500 req/cycle × 77 cycles = 192,500 req/day needed (77 keys)
- **After**: ~200 req/cycle × 77 cycles = 15,400 req/day needed (6 keys at 2,500 ea)
- **Savings**: ~92% reduction in API calls
- **Safety margin**: Can handle 10× traffic surge (up to 154,000 req/day with 130 keys)

### False Negatives & Detection Capability
- **Missed detections risk**: Low (5-10% estimated)
  - Reason: Coarse threshold 0.10 is conservative (LOS C/D boundary)
  - Most congestion events visible at tile level before detail confirmation
- **Cold-start problem**: 15-30 min delay before new incident appears in detail scan
  - Mitigation: Incident feed acts as early warning signal
  - Future: Integrate incident → priority detail scan

---

## Integration with Incident Feed

### Current (Baseline)
- Incidents detected in parallel, no coupling with flow data
- Risk: Incident-level severity independent of flow confirmation

### Proposed (Phase 2: Dual-Validation)
- Incident geo-location → find nearby hotspot tiles
- If incident near hotspot → promote to priority detail scan (5-min fast track)
- If incident NOT near hotspot but exists → trigger immediate tile re-scan for that area
- Result: Reduce false positives, confirm incidents with flow data

---

## Baseline Rotation (Future)

**Goal**: Ensure non-hotspot segments still have fresh free-flow speed baselines.

**Strategy** (to be implemented Phase 2):
```
Reserve 20% of budget for non-hotspot segment rotation
  - Nightly (22:00-03:00): Full baseline update for ALL segments
  - Daytime: 10% of budget samples random non-hotspots per cycle
  - Every 5 cycles: Shuffle to ensure coverage
```

---

## Tuning Recommendations

### Conservative (Safe, High Coverage)
- `FLOW_TILE_THRESHOLD = 0.15` (LOS D boundary, ~70% congestion)
- `FLOW_TILE_MAX_SEGMENTS_PER_TILE = 100` (allow more detail scans)
- Budget impact: ~300-400 req/cycle

### Aggressive (Minimal API, Some Blind Spots)
- `FLOW_TILE_THRESHOLD = 0.05` (LOS B/C boundary, ~30% congestion)
- `FLOW_TILE_MAX_SEGMENTS_PER_TILE = 20` (rate-limit strictly)
- Budget impact: ~100-150 req/cycle
- **Warning**: May miss emerging congestion

### Balanced (Recommended for HCM)
- `FLOW_TILE_THRESHOLD = 0.10` (LOS C/D boundary, ~50% congestion)
- `FLOW_TILE_MAX_SEGMENTS_PER_TILE = 50` (moderate detail)
- Budget impact: ~200 req/cycle
- **Good for**: City-wide early warning + incident dual-validation

---

## Troubleshooting

### Issue: "No tiles generated for HCM bbox"
- Check: `FLOW_TILE_HCM_BBOX` format is `lat_min,lon_min,lat_max,lon_max`
- Verify: Bbox covers HCM (~10.71-10.85 lat, ~106.62-106.78 lon)

### Issue: "Low hotspot detection rate (<1 hotspot per cycle)"
- Likely: Threshold too high
- Solution: Lower `FLOW_TILE_THRESHOLD` (try 0.05-0.08)

### Issue: "Too many API calls, quota exceeded"
- Solution: Reduce `FLOW_TILE_MAX_SEGMENTS_PER_TILE` (try 20-30)
- Or: Lower threshold to reduce hotspots

### Issue: "PostGIS queries timing out"
- Check: `dim_segment` spatial index on `geometry_center`
- SQL: `CREATE INDEX idx_segment_geom ON dim_segment USING GIST(geometry_center);`

---

## Next Steps

1. **Test with live data** (Phase 1 - Current)
   - Run `run-flow-tile-scan` on staging database
   - Monitor accuracy vs incident feed
   - Measure API call reduction

2. **Incident integration** (Phase 2)
   - Implement incident → promoted detail scan
   - Add dual-validation logic

3. **Baseline rotation** (Phase 3)
   - Implement background baseline updates
   - Ensure free-flow speed stays calibrated

4. **Adaptive thresholding** (Phase 4)
   - Time-of-day based thresholds
   - Historical congestion patterns

---

## References

- TomTom Traffic Flow Tile API: https://developer.tomtom.com/traffic-api/traffic-flow/tile-api
- PostGIS ST_DWithin: https://postgis.net/docs/ST_DWithin.html
- HCM Level of Service: HCM 2010 Transportation Research Board
