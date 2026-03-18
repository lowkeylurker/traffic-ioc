import sqlalchemy
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv(r"d:\DATN\traffic-ioc\data-pipeline\.env")

host = os.getenv("DB_HOST", "localhost")
port = os.getenv("DB_PORT", "5432")
db = os.getenv("DB_NAME", "traffic_ioc")
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")


db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
engine = sqlalchemy.create_engine(db_url)

with engine.connect() as conn:
    print("--- Detailed Table Info ---")
    tables = ['fact_traffic_flow', 'fact_corridor_performance']
    for t in tables:
        res = conn.execute(text(f"""
            SELECT relname, relkind 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'public' AND c.relname = '{t}'
        """))
        row = res.fetchone()
        if row:
            # relkind 'p' means partitioned table
            kind = row.relkind
            print(f"Table: {t} | relkind: {kind} ({'Partitioned' if kind == 'p' else 'Regular'})")
        else:
            print(f"Table: {t} not found.")
            
    res = conn.execute(text("SELECT MAX(timestamp) FROM fact_traffic_flow"))
    print(f"\nLatest traffic_flow: {res.scalar()}")
