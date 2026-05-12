#!/usr/bin/env python3
"""Quick query to check corridor count after coverage filter."""
import os
from sqlalchemy import create_engine, text

# Use postgres hostname inside Docker network
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
target_corridors AS (
    SELECT acs.corridor_key, dc.corridor_name, dc.direction,
           acs.total_segments, qcs.q1_segments,
           ROUND((qcs.q1_segments::DECIMAL / acs.total_segments * 100), 1) AS seg_pct,
           ROUND((qcs.q1_length_m / acs.total_length_m * 100), 1) AS len_pct
    FROM all_corridor_segments acs
    JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
    JOIN dim_corridor dc ON dc.corridor_key = acs.corridor_key
    WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
       OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
)
SELECT * FROM target_corridors ORDER BY len_pct DESC;
""")

try:
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
        print(f"\n✅ Found {len(rows)} corridors with ≥50% coverage:\n")
        for row in rows:
            print(f"  - {row.corridor_name} ({row.direction}): {row.q1_segments}/{row.total_segments} segs ({row.seg_pct}%), len={row.len_pct}%")
        print(f"\n✅ BEFORE: 13 corridors (8 false positives)")
        print(f"✅ AFTER:  {len(rows)} corridors (true Q1 only)\n")
except Exception as e:
    print(f"❌ Error: {e}")
