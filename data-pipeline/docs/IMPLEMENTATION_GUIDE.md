# Implementation: Replace Query in main.py

## Current Code to Replace

**File**: [data-pipeline/src/main.py](data-pipeline/src/main.py#L402-L465)

### BEFORE (Lines 402-465)

```python
_SEGMENT_QUERY_BY_TARGET_CORRIDORS = text("""
        WITH q1_boundary AS (
                SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
                FROM dim_location dl
                WHERE dl.geometry_polygon IS NOT NULL
                    AND (
                                LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
                         OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
                         OR LOWER(TRIM(dl.district)) LIKE '%district 1%'
                    )
        ),
        all_corridor_segments AS (
                -- Count total segments for each corridor
                SELECT bcs.corridor_key,
                       COUNT(*) AS total_segments,
                       SUM(ds.length_m) AS total_length_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                WHERE ds.geometry_center IS NOT NULL
                GROUP BY bcs.corridor_key
        ),
        q1_corridor_segments AS (
                -- Count segments within Q1 for each corridor
                SELECT bcs.corridor_key,
                       COUNT(*) AS q1_segments,
                       SUM(ds.length_m) AS q1_length_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                CROSS JOIN q1_boundary qb
                WHERE ds.geometry_center IS NOT NULL
                    AND (
                                (qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
                         OR (
                                        qb.geom IS NULL
                                AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                                AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                         )
                    )
                GROUP BY bcs.corridor_key
        ),
        target_corridors AS (
                -- Filter corridors by coverage threshold (≥50% of segments OR length in Q1)
                SELECT acs.corridor_key
                FROM all_corridor_segments acs
                JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
                WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
                   OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
        )
    SELECT DISTINCT
           s.segment_key,
           ST_Y(s.geometry_center) AS lat,
           ST_X(s.geometry_center) AS lon,
           COALESCE(w.default_lane_count, 2) AS lane_count
    FROM   dim_segment s
    JOIN   dim_way w ON s.way_key = w.way_key
    JOIN   bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN   target_corridors tc ON tc.corridor_key = bcs.corridor_key
    WHERE  s.geometry_center IS NOT NULL
      AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    ORDER  BY s.segment_key
    LIMIT  :limit
""")
```

---

### AFTER (Improved Version)

```python
_SEGMENT_QUERY_BY_TARGET_CORRIDORS = text("""
        WITH q1_boundary AS (
                SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
                FROM dim_location dl
                WHERE dl.geometry_polygon IS NOT NULL
                    AND (
                                LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
                         OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
                         OR LOWER(TRIM(dl.district)) LIKE '%district 1%'
                    )
        ),
        all_corridor_segments AS (
                -- Count total segments for each corridor
                SELECT bcs.corridor_key,
                       COUNT(DISTINCT bcs.segment_key) AS total_segments,
                       SUM(ds.length_m) AS total_length_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                WHERE ds.geometry_center IS NOT NULL
                GROUP BY bcs.corridor_key
        ),
        q1_corridor_segments AS (
                -- Count segments within Q1 for each corridor + minimum distance to Q1 boundary
                SELECT bcs.corridor_key,
                       COUNT(DISTINCT bcs.segment_key) AS q1_segments,
                       SUM(ds.length_m) AS q1_length_m,
                       MIN(
                           CASE
                               WHEN qb.geom IS NOT NULL THEN ST_Distance(ds.geometry_center::geography, qb.geom::geography)
                               ELSE 0
                           END
                       ) AS min_dist_to_q1_m
                FROM bridge_corridor_segment bcs
                JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
                CROSS JOIN q1_boundary qb
                WHERE ds.geometry_center IS NOT NULL
                    AND (
                                (qb.geom IS NOT NULL AND ST_DWithin(ds.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
                         OR (
                                        qb.geom IS NULL
                                AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                                AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                         )
                    )
                GROUP BY bcs.corridor_key
        ),
        selected_corridors AS (
                -- IMPROVED: Tiered corridor filtering with gateway support
                -- Main corridors: >= 40% of length in Q1
                -- Gateway corridors: >= 15% of length in Q1 AND <= 1500m from Q1 boundary
                SELECT acs.corridor_key,
                       acs.total_segments,
                       acs.total_length_m,
                       COALESCE(qcs.q1_length_m, 0) AS q1_length_m,
                       COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) AS q1_length_pct,
                       COALESCE(qcs.min_dist_to_q1_m, 999999.0) AS min_dist_to_q1_m
                FROM all_corridor_segments acs
                LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
                WHERE (
                    -- Main corridors: >= 40% length in Q1
                    COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :q1_length_threshold
                    OR (
                        -- Gateway corridors: >= 15% length in Q1 AND <= 1500m from boundary
                        COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :gateway_length_threshold
                        AND COALESCE(qcs.min_dist_to_q1_m, 999999.0) <= :gateway_distance_m
                    )
                )
        )
    SELECT DISTINCT
           s.segment_key,
           ST_Y(s.geometry_center) AS lat,
           ST_X(s.geometry_center) AS lon,
           COALESCE(w.default_lane_count, 2) AS lane_count
    FROM   dim_segment s
    JOIN   dim_way w ON s.way_key = w.way_key
    JOIN   bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN   selected_corridors sc ON sc.corridor_key = bcs.corridor_key
    CROSS JOIN q1_boundary qb
    WHERE  s.geometry_center IS NOT NULL
      AND  w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
      AND  (
               (qb.geom IS NOT NULL AND ST_DWithin(s.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
            OR (
                       qb.geom IS NULL
                AND ST_X(s.geometry_center) BETWEEN :min_lon AND :max_lon
                AND ST_Y(s.geometry_center) BETWEEN :min_lat AND :max_lat
               )
           )
    ORDER  BY s.segment_key
    LIMIT  :limit
""")
```

---

## Changes Required in _load_segment_points() Function

**File**: [data-pipeline/src/main.py](data-pipeline/src/main.py#L510-L530)

### Current Code (Lines 510-530)

```python
    if target_corridor_mode:
        from src.domain.geo.constants import BBOX_TARGET_DISTRICT
        # Q1 has ~920 segments, use generous limit
        effective_limit = max(limit, _MAX_SEGMENTS_TARGET_CORRIDORS)
        query_limit = effective_limit  # No overfetch factor needed, we want all
        target_bbox = BBOX_TARGET_DISTRICT
    else:
        query_limit = max(limit, int(limit * max(1, overfetch_factor)))
        target_bbox = None

    with engine.connect() as conn:
        if target_corridor_mode:
            params = {
                "limit": query_limit,
                "min_lon": target_bbox["min_lon"],
                "max_lon": target_bbox["max_lon"],
                "min_lat": target_bbox["min_lat"],
                "max_lat": target_bbox["max_lat"],
            }
            rows = conn.execute(_SEGMENT_QUERY_BY_TARGET_CORRIDORS, params).fetchall()
```

### Updated Code

```python
    if target_corridor_mode:
        from src.domain.geo.constants import BBOX_TARGET_DISTRICT
        # Q1 has ~372 segments with improved filtering (40% main + 15% gateway logic)
        effective_limit = max(limit, _MAX_SEGMENTS_TARGET_CORRIDORS)
        query_limit = effective_limit  # No overfetch factor needed, we want all
        target_bbox = BBOX_TARGET_DISTRICT
    else:
        query_limit = max(limit, int(limit * max(1, overfetch_factor)))
        target_bbox = None

    with engine.connect() as conn:
        if target_corridor_mode:
            params = {
                "limit": query_limit,
                "min_lon": target_bbox["min_lon"],
                "max_lon": target_bbox["max_lon"],
                "min_lat": target_bbox["min_lat"],
                "max_lat": target_bbox["max_lat"],
                "q1_length_threshold": 0.40,          # 40% - Main corridor threshold
                "gateway_length_threshold": 0.15,     # 15% - Gateway corridor threshold
                "gateway_distance_m": 1500,           # 1500m - Distance threshold
            }
            rows = conn.execute(_SEGMENT_QUERY_BY_TARGET_CORRIDORS, params).fetchall()
```

---

## Update Constants (Optional but Recommended)

**File**: [data-pipeline/src/main.py](data-pipeline/src/main.py#L468-L475)

### Current

```python
# For target corridor mode (Q1 only): fetch all segments (920 as of Mar 2026)
# Use this for batch ETL or when you want complete coverage
_MAX_SEGMENTS_TARGET_CORRIDORS = 1000
```

### Updated

```python
# For target corridor mode (Q1 only): fetch all segments (~372 with improved filtering)
# Uses 3-layer logic: main (40% coverage) + gateway (15% coverage within 1500m)
_MAX_SEGMENTS_TARGET_CORRIDORS = 1000  # Generous limit to capture all qualified segments

# Q1 corridor filtering thresholds
_Q1_LENGTH_THRESHOLD = 0.40            # 40% - Main corridor threshold
_GATEWAY_LENGTH_THRESHOLD = 0.15       # 15% - Gateway corridor threshold  
_GATEWAY_DISTANCE_M = 1500             # 1500m - Distance threshold for gateway corridors
```

Then use these constants in the params dict:

```python
params = {
    "limit": query_limit,
    "min_lon": target_bbox["min_lon"],
    "max_lon": target_bbox["max_lon"],
    "min_lat": target_bbox["min_lat"],
    "max_lat": target_bbox["max_lat"],
    "q1_length_threshold": _Q1_LENGTH_THRESHOLD,
    "gateway_length_threshold": _GATEWAY_LENGTH_THRESHOLD,
    "gateway_distance_m": _GATEWAY_DISTANCE_M,
}
```

---

## Testing After Implementation

### 1. Check the query executes without error

```bash
# In VS Code terminal
docker-compose exec data-pipeline python -m src.main run-realtime
```

### 2. Expected log output

**BEFORE**: 
```
Loaded 4 segment points from DB (target_corridors_Q1) (query_limit=1000, duplicates_skipped=0)
```

**AFTER**:
```
Loaded 372 segment points from DB (target_corridors_Q1) (query_limit=1000, duplicates_skipped=X)
```

### 3. Verify results

Run the improved analysis script:
```bash
docker-compose exec data-pipeline python scripts/show_q1_etl_corridors.py
```

Should show:
```
IMPROVED TOTAL: 40+ corridors | 372+ segments
```

---

## Diff Summary

| Component | Change | Lines |
|-----------|--------|-------|
| Q1 corridor selection logic | Replace 50% threshold with 40%/15% tiered logic | 442-450 |
| q1_corridor_segments CTE | Add min_dist_to_q1_m calculation | 423-438 |
| Segment WHERE clause | Add ST_DWithin proximity filter | Final WHERE |
| Parameters dict | Add 3 new parameters (thresholds + distance) | 520-528 |
| Comment | Update expected segment count | 468-469 |
| Constants | Add Q1 threshold definitions (optional) | After 472 |

**Total changes**: 4-5 blocks, ~30-40 lines updated/added

---

## Rollback Plan

If something breaks:

1. Keep the current `_SEGMENT_QUERY_BY_TARGET_CORRIDORS` in git history
2. To revert: `git checkout data-pipeline/src/main.py`
3. Test: `docker-compose exec data-pipeline python -m src.main run-realtime`

---

## Related Files (For Reference)

These files use the improved logic already and can serve as examples:

- [data-pipeline/scripts/show_q1_etl_corridors.py](data-pipeline/scripts/show_q1_etl_corridors.py) - Full implementation with impact scoring
- [QUERY_COMPARISON_QUICK_REFERENCE.md](QUERY_COMPARISON_QUICK_REFERENCE.md) - Quick reference guide
- [Q1_QUERY_COMPARISON_ANALYSIS.md](Q1_QUERY_COMPARISON_ANALYSIS.md) - Detailed analysis
