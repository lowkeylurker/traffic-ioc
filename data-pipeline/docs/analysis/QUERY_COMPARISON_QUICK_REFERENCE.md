# Query Comparison: Side-by-Side SQL

## The Core Problem: Why Only 4 Segments?

### Current Query Filter (PROBLEM)
```sql
target_corridors AS (
    SELECT acs.corridor_key
    FROM all_corridor_segments acs
    JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
    WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)      ← 50% THRESHOLD
       OR (qcs.q1_length_m / acs.total_length_m >= 0.5)              ← TOO RESTRICTIVE
)
```

**Result**: Only 4 corridors qualify → 4 segments loaded

---

### Improved Query Filter (SOLUTION)
```sql
selected_corridors AS (
    SELECT acs.corridor_key
    FROM all_corridor_segments acs
    LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
    WHERE (
        -- Main corridors: strong Q1 presence
        COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= 0.40   ← 40% MAIN
        OR (
            -- Gateway corridors: near Q1 with some presence
            COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= 0.15  ← 15% GATEWAY
            AND COALESCE(qcs.min_dist_to_q1_m, 999999.0) <= 1500                     ← ±1500m BUFFER
        )
    )
)
```

**Result**: 40+ corridors qualify → 372 segments loaded (~93x improvement)

---

## What's Different?

### 1. Corridor Selection

| Aspect | Current | Improved |
|--------|---------|----------|
| Threshold Type | Binary (50% or nothing) | Tiered (40% main, 15% gateway) |
| Gateway Support | No | Yes |
| Distance Aware | No | Yes (min_dist_to_q1_m) |
| Removed Corridors | 46+ corridors (too restrictive) | None |
| Result | 4 corridors | 40+ corridors |

### 2. Missing Piece: Distance Calculation

The improved query adds this crucial calculation:

```sql
q1_corridor_segments AS (
    SELECT
        bcs.corridor_key,
        COUNT(*) AS q1_segments,
        SUM(ds.length_m) AS q1_length_m,
        MIN(ST_Distance(ds.geometry_center::geography, qb.geom::geography)) 
            AS min_dist_to_q1_m  ← NEW: Enables gateway logic
    FROM ...
)
```

Without `min_dist_to_q1_m`, can't identify "near Q1" corridors.

### 3. Segment-Level Filter

**Current**: Uses all segments from selected corridors
```sql
WHERE s.geometry_center IS NOT NULL
  AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
```

**Improved**: Additional geographic check
```sql
WHERE s.geometry_center IS NOT NULL
  AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
  AND ST_DWithin(s.geometry_center::geography, qb.geom::geography, 1500)  ← SEGMENT PROXIMITY
```

---

## Threshold Comparison

### Current Logic (DON'T USE)
```
IF corridor ≥ 50% in Q1 THEN include
ELSE exclude
```

```
Typical Q1 Coverage:
┌─────────────────────────────────────┐
│ Corridor 1: 35% in Q1 → EXCLUDED ❌ │ (only 35%, not 50%)
│ Corridor 2: 55% in Q1 → INCLUDED ✅  │ (55% qualifies)
│ Corridor 3: 20% in Q1 → EXCLUDED ❌ │ (only 20%, not 50%)
└─────────────────────────────────────┘
Result: 4 corridors, 4 segments
```

### Improved Logic (USE THIS)
```
IF corridor ≥ 40% in Q1 THEN include (Main)
ELSE IF corridor ≥ 15% in Q1 AND distance ≤ 1500m THEN include (Gateway)
ELSE exclude
```

```
Typical Q1 Coverage:
┌──────────────────────────────────────────────────────────────┐
│ Corridor 1: 35% in Q1, 1200m away → INCLUDED ✅ (gateway)   │
│ Corridor 2: 55% in Q1 → INCLUDED ✅ (main)                   │
│ Corridor 3: 20% in Q1, 800m away → INCLUDED ✅ (gateway)     │
│ Corridor 4: 10% in Q1, 2000m away → EXCLUDED ❌ (too far)    │
│ Corridor 5: 42% in Q1 → INCLUDED ✅ (main)                   │
│ ... more corridors match criteria ...                         │
└──────────────────────────────────────────────────────────────┘
Result: 40+ corridors, 372 segments
```

---

## SQL Feature Comparison

| Feature | Current | Improved | Why Matters |
|---------|---------|----------|------------|
| `ST_Within()` | ✅ Segments exactly in Q1 | ✅ Same | Baseline boundary check |
| `ST_DWithin()` | ❌ None | ✅ 1500m buffer | Captures nearby corridors |
| Distance Metric | ❌ Not calculated | ✅ min_dist_to_q1_m | Enables gateway filtering |
| Coverage % | ✅ Calculated | ✅ Calculated + used smartly | Current doesn't use smartly |
| Gateway Logic | ❌ None | ✅ % + distance combined | Includes semi-relevant corridors |
| Result Count | 4 | 372 | 93x improvement |

---

## Implementation Locations

### Current Implementation (OUTDATED)
📁 **File**: [data-pipeline/src/main.py](data-pipeline/src/main.py)
- **Query def**: Lines 402-465 (`_SEGMENT_QUERY_BY_TARGET_CORRIDORS`)
- **Called by**: Line 629-633 (`run-realtime` command)
- **Parameter**: `target_corridor_mode=True`

### Improved Implementation (TO COPY)
📁 **File**: [data-pipeline/scripts/show_q1_etl_corridors.py](data-pipeline/scripts/show_q1_etl_corridors.py)
- **Query 1**: Lines 89-159 (detailed with impact scoring)
- **Constants**: Lines 15-17 (thresholds)
- **Execution**: Lines 361-365 (params passed)

---

## Quick Fix Checklist

To upgrade from 4 → 372 segments:

- [ ] Copy improved corridor selection logic from show_q1_etl_corridors.py (lines 120-160)
- [ ] Add `min_dist_to_q1_m` calculation to q1_corridor_segments CTE
- [ ] Update WHERE clause: `(q1_length >= 0.40) OR (q1_length >= 0.15 AND dist <= 1500)`
- [ ] Add segment-level ST_DWithin filter (1500m from Q1)
- [ ] Parameterize thresholds: 0.40, 0.15, 1500
- [ ] Increase `_MAX_SEGMENTS_TARGET_CORRIDORS` from 1000 to handle 372+ segments
- [ ] Test: `docker-compose exec data-pipeline python -m src.main run-realtime`
- [ ] Verify: Log should show "Loaded 372 segment points from DB (target_corridors_Q1)"

---

## Test Results Expected

```
BEFORE (Current):
  Loaded 4 segment points from DB (target_corridors_Q1)
  → Severely limited traffic monitoring
  → Misses most Q1 corridors

AFTER (Improved):
  Loaded 372 segment points from DB (target_corridors_Q1)
  → Comprehensive Q1 coverage
  → ~93x improvement in segments
  → Better traffic pattern detection
```

---

## Why This Matters

### Urban Traffic Monitoring
- **4 segments**: Can't detect majority of traffic patterns in Q1
- **372 segments**: Covers all major/secondary roads, catches incidents and congestion

### Data Quality
- **4 segments**: Heavy bias toward only the most Q1-centric corridors
- **372 segments**: Balanced mix of main and gateway corridors with local relevance

### ETL Completeness
- **4 segments**: Incomplete picture for forecasting/incident response
- **372 segments**: Full picture for ML models and decision support
