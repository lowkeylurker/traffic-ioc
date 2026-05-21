from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    r = conn.execute(text("SELECT relname, relkind FROM pg_class WHERE relname = 'dim_segment_q1'")).fetchone()
    print(f"Object: {r}")
