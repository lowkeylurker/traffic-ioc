from sqlalchemy import create_engine, text
import os

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    sql = text("""
        SELECT timestamp, count(*) 
        FROM fact_traffic_flow 
        WHERE inserted_at > NOW() - INTERVAL '30 minutes' 
        GROUP BY timestamp 
        ORDER BY timestamp DESC;
    """)
    rows = conn.execute(sql).fetchall()
    print("--- RECENT DATA IN CLOUD DB ---")
    for row in rows:
        print(f"Timestamp: {row[0]}, Count: {row[1]}")
    
    if not rows:
        print("No recent data found in the last 30 minutes.")
        
    # Check max inserted_at to see when the last write happened
    max_sql = text("SELECT MAX(inserted_at) FROM fact_traffic_flow")
    max_val = conn.execute(max_sql).scalar()
    print(f"Latest inserted_at: {max_val}")
