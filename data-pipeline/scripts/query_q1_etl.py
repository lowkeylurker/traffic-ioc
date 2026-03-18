import os
import sys
# DB connection from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    db_ssl = os.getenv("DB_SSLMODE", "require")

    DATABASE_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}?sslmode={db_ssl}"

os.environ["DB_CONNECTION_STRING"] = DATABASE_URL

sys.path.insert(0, "/app")

from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DB_CONNECTION_STRING"])

# Query để lấy danh sách corridors sẽ được ETL
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

with engine.connect() as conn:
    results = conn.execute(query).fetchall()
    summary = conn.execute(summary_query).fetchone()
    
    with open('/tmp/q1_etl_stats_output.txt', 'w', encoding='utf-8') as f:
        f.write("\n" + "="*100 + "\n")
        f.write("CORRIDORS SẼ ĐƯỢC ETL VÀO fact_traffic_flow (Quận 1 - PostGIS Polygon Filtering)\n")
        f.write("="*100 + "\n\n")
        
        f.write(f"{'STT':<5} {'Corridor Name':<50} {'Priority':<10} {'Segments':<10} {'Length (m)':<15}\n")
        f.write("-" * 100 + "\n")
        
        for idx, row in enumerate(results, 1):
            f.write(f"{idx:<5} {row[1]:<50} {float(row[2]):<10.2f} {row[3]:<10} {float(row[4]):>14,.0f}\n")
        
        f.write("="*100 + "\n")
        f.write(f"TỔNG CỘNG: {summary[0]} corridors | {summary[1]} segments\n")
        f.write("="*100 + "\n")
        
print("Results saved to /tmp/q1_etl_stats_output.txt")
