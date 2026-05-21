from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

with engine.begin() as conn:
    conn.execute(text("TRUNCATE TABLE dim_segment_q1"))
    
    insert_sql = text("""
        INSERT INTO dim_segment_q1 (segment_key, geometry_center)
        SELECT DISTINCT s.segment_key, s.geometry_center
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN dim_road rd ON w.road_key = rd.road_key
        WHERE rd.name IS NOT NULL 
          AND rd.name != ''
          -- Exclude alleys (Hẻm, Kiệt, Ngách)
          AND rd.name NOT ILIKE 'Hẻm %'
          AND rd.name NOT ILIKE '% Hẻm %'
          AND rd.name NOT ILIKE 'Kiệt %'
          AND rd.name NOT ILIKE 'Ngách %'
          -- Basic Q1 BBOX
          AND ST_Within(s.geometry_center, ST_MakeEnvelope(106.663, 10.743, 106.723, 10.803, 4326))
        ON CONFLICT (segment_key) DO NOTHING
    """)
    
    result = conn.execute(insert_sql)
    print(f"All Named Roads in Q1 (excluding alleys) population finished. Total segments: {result.rowcount}")
