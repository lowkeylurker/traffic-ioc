from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    sql = text("""
        SELECT timestamp, COUNT(*) as segment_count 
        FROM fact_traffic_flow 
        WHERE timestamp = (SELECT MAX(timestamp) FROM fact_traffic_flow)
        GROUP BY timestamp
    """)
    res = conn.execute(sql).fetchone()
    if res:
        print(f"Latest Timestamp: {res[0]}")
        print(f"Total Segments Loaded: {res[1]}")
    else:
        print("No data found in fact_traffic_flow.")
