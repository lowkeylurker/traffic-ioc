import sqlalchemy
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv(r"d:\DATN\traffic-ioc\data-pipeline\.env")

host = os.getenv("DB_HOST")
port = os.getenv("DB_PORT")
db = os.getenv("DB_NAME")
user = os.getenv("DB_USER")
password = os.getenv("DB_PASSWORD")



db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
engine = sqlalchemy.create_engine(db_url)

fact_tables = [
    "fact_traffic_flow",
    "fact_incident",
    "fact_weather",
    "fact_corridor_performance"
]

with engine.connect() as conn:
    print("--- Fact Table Status ---")
    for table in fact_tables:
        try:
            res = conn.execute(text(f"SELECT count(*) FROM {table}"))
            count = res.scalar()
            print(f"{table}: {count} records")
        except Exception as e:
            print(f"{table}: ERROR ({str(e).splitlines()[0]})")
    
    print("\n--- Partition Check ---")
    try:
        res = conn.execute(text("""
            SELECT nmsp_parent.nspname AS parent_schema,
                   parent.relname      AS parent_name,
                   nmsp_child.nspname  AS child_schema,
                   child.relname       AS child_name
            FROM pg_inherits
                JOIN pg_class parent            ON pg_inherits.inhparent = parent.oid
                JOIN pg_class child             ON pg_inherits.inhrelid  = child.oid
                JOIN pg_namespace nmsp_parent   ON nmsp_parent.oid       = parent.relnamespace
                JOIN pg_namespace nmsp_child    ON nmsp_child.oid       = child.relnamespace
            WHERE parent.relname IN ('fact_traffic_flow', 'fact_incident', 'fact_corridor_performance');
        """))
        partitions = res.fetchall()
        if not partitions:
            print("No partitions found.")
        for p in partitions:
            print(f"Parent: {p.parent_name} | Child: {p.child_name}")
    except Exception as e:
         print(f"Partition check failed: {e}")
