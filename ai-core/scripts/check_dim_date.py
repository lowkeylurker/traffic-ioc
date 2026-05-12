import pandas as pd
from sqlalchemy import text
from src.core.database import get_engine

engine = get_engine()
query = text("""
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'dim_date';
""")

with engine.connect() as conn:
    df = pd.read_sql_query(query, conn)
    print(df)
