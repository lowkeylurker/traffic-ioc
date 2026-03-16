import sqlalchemy
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv(r"d:\DATN\traffic-ioc\data-pipeline\.env")

host = os.getenv("DB_HOST", "")
port = os.getenv("DB_PORT", "")
db = os.getenv("DB_NAME", "")
user = os.getenv("DB_USER", "")
password = os.getenv("DB_PASSWORD", "")

db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}"
engine = sqlalchemy.create_engine(db_url)

with engine.connect() as conn:
    res = conn.execute(text("SELECT count(*) FROM dim_segment"))
    count = res.scalar()
    print(f"Total segments: {count}")
    
    res = conn.execute(text("SELECT count(*) FROM dim_segment WHERE location_key IS NOT NULL"))
    mapped_count = res.scalar()
    print(f"Mapped segments: {mapped_count}")
