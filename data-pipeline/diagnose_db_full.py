import sqlalchemy
from sqlalchemy import text, inspect
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

inspector = inspect(engine)
tables = inspector.get_table_names()

with engine.connect() as conn:
    print("--- Database Table Counts ---")
    for table in sorted(tables):
        try:
            res = conn.execute(text(f'SELECT count(*) FROM "{table}"'))
            count = res.scalar()
            print(f"{table:30}: {count} records")
        except Exception as e:
            print(f"{table:30}: ERROR")

    print("\n--- Top 5 segments from fact_traffic_flow ---")
    try:
        res = conn.execute(text("SELECT * FROM fact_traffic_flow ORDER BY timestamp DESC LIMIT 5"))
        rows = res.fetchall()
        for r in rows:
            print(r)
    except Exception as e:
        print(f"Error querying fact_traffic_flow: {e}")
