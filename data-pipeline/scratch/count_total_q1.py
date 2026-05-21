from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    sql = text("SELECT COUNT(*) FROM dim_segment WHERE ST_Within(geometry_center, ST_MakeEnvelope(106.663, 10.743, 106.723, 10.803, 4326))")
    total = conn.execute(sql).scalar()
    print(f"Total possible segments in D1 BBOX (all roads, all types): {total}")
