from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    sql = text("""
        SELECT 
            COUNT(s.segment_key) AS total,
            COUNT(ftf.segment_key) AS with_data
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        LEFT JOIN fact_traffic_flow ftf ON s.segment_key = ftf.segment_key 
            AND ftf.timestamp = '2026-05-05 10:40:59.535345'
        WHERE w.osm_highway_type IN ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
                                     'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link')
        AND ST_Within(s.geometry_center, ST_MakeEnvelope(106.663, 10.743, 106.723, 10.803, 4326));
    """)
    r = conn.execute(sql).fetchone()
    print(f"Verification Results:")
    print(f"Total Q1 Major Segments: {r[0]}")
    print(f"Segments with Data at 10:40:59: {r[1]}")
    print(f"Coverage: {r[1]*100.0/r[0]:.2f}%")
