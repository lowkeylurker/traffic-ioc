from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

with engine.connect() as conn:
    sql = text("""
        SELECT DISTINCT rd.name
        FROM dim_segment_q1 q1
        JOIN dim_segment s ON q1.segment_key = s.segment_key
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN dim_road rd ON w.road_key = rd.road_key
        ORDER BY rd.name
    """)
    results = conn.execute(sql).fetchall()
    
    with open('d:/DATN/traffic-ioc/data-pipeline/scratch/q1_road_names_final.txt', 'w', encoding='utf-8') as f:
        for row in results:
            f.write(f"{row[0]}\n")

print(f"Exported {len(results)} unique road names to q1_road_names_final.txt")
