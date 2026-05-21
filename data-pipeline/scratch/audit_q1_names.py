from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)

with e.connect() as conn:
    # Check for segments in dim_segment_q1 that might be "nameless" in the underlying dim_road
    sql = text("""
        SELECT rd.name, COUNT(*) 
        FROM dim_segment_q1 q1
        JOIN dim_segment s ON q1.segment_key = s.segment_key
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN dim_road rd ON w.road_key = rd.road_key
        WHERE rd.name IS NULL OR rd.name = '' OR rd.name ILIKE '%unnamed%' OR rd.name ILIKE '%no name%'
        GROUP BY rd.name
    """)
    results = conn.execute(sql).fetchall()
    if results:
        print("Found nameless or unnamed roads in dim_segment_q1:")
        for row in results:
            print(f" - Name: '{row[0]}', Count: {row[1]}")
    else:
        print("No explicitly nameless roads found with simple check. Checking for suspicious names...")
        # Check first 20 names to see if anything looks like a nameless road
        sql2 = text("""
            SELECT DISTINCT rd.name
            FROM dim_segment_q1 q1
            JOIN dim_segment s ON q1.segment_key = s.segment_key
            JOIN dim_way w ON s.way_key = w.way_key
            JOIN dim_road rd ON w.road_key = rd.road_key
            LIMIT 20
        """)
        results2 = conn.execute(sql2).fetchall()
        for row in results2:
            print(f" - '{row[0]}'")
