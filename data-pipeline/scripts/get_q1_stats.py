import os
os.environ.setdefault("DB_CONNECTION_STRING", "postgresql://traffic_admin:traffic_pass@postgres:5432/traffic_ioc")

from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DB_CONNECTION_STRING"])

query = text("""
WITH q1_boundary AS (
    SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
    FROM dim_location dl
    WHERE dl.geometry_polygon IS NOT NULL
      AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
           OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
),
target_corridors AS (
    SELECT DISTINCT bcs.corridor_key
    FROM bridge_corridor_segment bcs
    JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
    CROSS JOIN q1_boundary qb
    WHERE ds.geometry_center IS NOT NULL
      AND ((qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
           OR (qb.geom IS NULL
               AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
               AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803))
),
etl_segments AS (
    SELECT DISTINCT s.segment_key, bcs.corridor_key, s.length_m
    FROM dim_segment s
    JOIN dim_way w ON s.way_key = w.way_key
    JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
    WHERE s.geometry_center IS NOT NULL
      AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
)
SELECT 
    c.corridor_key,
    c.corridor_name,
    ROUND(c.priority_score::numeric, 2) AS priority,
    COUNT(DISTINCT es.segment_key) AS segments,
    ROUND(SUM(es.length_m)::numeric, 0) AS length_m
FROM dim_corridor c
JOIN etl_segments es ON es.corridor_key = c.corridor_key
GROUP BY c.corridor_key, c.corridor_name, c.priority_score
ORDER BY c.priority_score DESC
""")

summary_query = text("""
WITH q1_boundary AS (
    SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
    FROM dim_location dl
    WHERE dl.geometry_polygon IS NOT NULL
      AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
           OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
),
target_corridors AS (
    SELECT DISTINCT bcs.corridor_key
    FROM bridge_corridor_segment bcs
    JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
    CROSS JOIN q1_boundary qb
    WHERE ds.geometry_center IS NOT NULL
      AND ((qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
           OR (qb.geom IS NULL
               AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
               AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803))
),
etl_segments AS (
    SELECT DISTINCT s.segment_key, bcs.corridor_key
    FROM dim_segment s
    JOIN dim_way w ON s.way_key = w.way_key
    JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
    WHERE s.geometry_center IS NOT NULL
      AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
)
SELECT COUNT(DISTINCT corridor_key) AS corridors, COUNT(DISTINCT segment_key) AS segments
FROM etl_segments
""")

print("\n" + "="*80)
print("CORRIDORS SẼ ĐƯỢC ETL VÀO fact_traffic_flow (Quận 1)")
print("="*80)

with engine.connect() as conn:
    results = conn.execute(query).fetchall()
    
    print(f"\n{'ID':<5} {'Corridor Name':<40} {'Priority':<10} {'Segments':<10} {'Length (m)':<12}")
    print("-" * 80)
    
    for row in results:
        print(f"{row[0]:<5} {row[1]:<40} {float(row[2]):<10.2f} {row[3]:<10} {float(row[4]):>11,.0f}")
    
    print("\n" + "="*80)
    summary = conn.execute(summary_query).fetchone()
    print(f"TỔNG CỘNG: {summary[0]} corridors | {summary[1]} segments")
    print("="*80 + "\n")
