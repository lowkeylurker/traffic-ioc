from sqlalchemy import create_engine, text
db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
e = create_engine(db_url)
with e.connect() as conn:
    r = conn.execute(text("SELECT definition FROM pg_matviews WHERE matviewname = 'dim_segment_q1'")).scalar()
    import sys
    sys.stdout.buffer.write(f"Definition: {r}\n".encode('utf-8'))
