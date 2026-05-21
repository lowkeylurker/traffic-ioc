
import os
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require"
engine = create_engine(DATABASE_URL)

query = """
SELECT l.district, COUNT(*) 
FROM fact_traffic_flow f 
JOIN dim_segment s ON f.segment_key = s.segment_key 
JOIN dim_location l ON s.location_key = l.location_key 
WHERE f.date_key = 20260505 
GROUP BY l.district;
"""

with engine.connect() as conn:
    result = conn.execute(text(query)).fetchall()
    print("district | count")
    for row in result:
        # Thay thế ký tự tiếng Việt bằng ASCII để tránh lỗi console Windows
        d = str(row[0])
        print(f"{d} | {row[1]}")
