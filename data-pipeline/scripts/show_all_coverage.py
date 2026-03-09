#!/usr/bin/env python3
"""Show ALL corridors with Q1 coverage percentages (not filtered)."""
import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://traffic_user:traffic_password@postgres:5432/traffic_ioc")
engine = create_engine(DATABASE_URL)

query = text("""
WITH q1_boundary AS (
    SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
    FROM dim_location dl
    WHERE dl.geometry_polygon IS NOT NULL
        AND (LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
             OR LOWER(TRIM(dl.district)) LIKE '%quận 1%')
),
all_corridor_segments AS (
    SELECT bcs.corridor_key, COUNT(*) AS total_segments,
           SUM(ds.length_m) AS total_length_m
    FROM bridge_corridor_segment bcs
    JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
    WHERE ds.geometry_center IS NOT NULL
    GROUP BY bcs.corridor_key
),
q1_corridor_segments AS (
    SELECT bcs.corridor_key, COUNT(*) AS q1_segments,
           SUM(ds.length_m) AS q1_length_m
    FROM bridge_corridor_segment bcs
    JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
    CROSS JOIN q1_boundary qb
    WHERE ds.geometry_center IS NOT NULL
        AND ST_Within(ds.geometry_center, qb.geom)
    GROUP BY bcs.corridor_key
),
all_corridors_with_coverage AS (
    SELECT acs.corridor_key, dc.corridor_name, dc.direction,
           acs.total_segments, COALESCE(qcs.q1_segments, 0) AS q1_segments,
           ROUND((COALESCE(qcs.q1_segments, 0)::DECIMAL / acs.total_segments * 100), 1) AS seg_pct,
           ROUND((COALESCE(qcs.q1_length_m, 0) / acs.total_length_m * 100), 1) AS len_pct
    FROM all_corridor_segments acs
    LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
    JOIN dim_corridor dc ON dc.corridor_key = acs.corridor_key
    WHERE COALESCE(qcs.q1_segments, 0) > 0  -- Only corridors with at least 1 Q1 segment
)
SELECT * FROM all_corridors_with_coverage ORDER BY len_pct DESC;
""")

try:
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
        print(f"\n{'='*90}")
        print(f"ALL CORRIDORS WITH Q1 COVERAGE (No Filter Applied)")
        print(f"{'='*90}\n")
        print(f"{'Corridor Name':<45} {'Dir':<4} {'Q1/Tot Seg':<12} {'Seg%':<8} {'Len%':<8}")
        print(f"{'-'*90}")
        
        count_50_plus = 0
        count_20_50 = 0
        count_under_20 = 0
        
        for row in rows:
            name = row.corridor_name or "Unknown"
            direction = row.direction or "N/A"
            seg_ratio = f"{row.q1_segments}/{row.total_segments}"
            seg_pct = row.seg_pct
            len_pct = row.len_pct
            
            # Classify
            if seg_pct >= 50:
                marker = "✅ TRUE"
                count_50_plus += 1
            elif seg_pct >= 20:
                marker = "🟡 PART"
                count_20_50 += 1
            else:
                marker = "❌ FALSE"
                count_under_20 += 1
            
            print(f"{name:<45} {direction:<4} {seg_ratio:<12} {seg_pct:<7.1f}% {len_pct:<7.1f}% {marker}")
        
        print(f"\n{'-'*90}")
        print(f"SUMMARY:")
        print(f"  ✅ TRUE Q1 (≥50%):      {count_50_plus} corridors")
        print(f"  🟡 PARTIAL (20-49%):    {count_20_50} corridors")
        print(f"  ❌ FALSE POSITIVE(<20%): {count_under_20} corridors")
        print(f"  📊 TOTAL:                {len(rows)} corridors")
        print(f"{'='*90}\n")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
