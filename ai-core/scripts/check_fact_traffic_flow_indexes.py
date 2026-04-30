import pandas as pd
from sqlalchemy import text
from src.core.database import get_engine

engine = get_engine()
query = text("""
SELECT
    indexname,
    indexdef
FROM
    pg_indexes
WHERE
    tablename = 'fact_traffic_flow';
""")

with engine.connect() as conn:
    df = pd.read_sql_query(query, conn)
    pd.set_option('display.max_colwidth', None)
    print(df)
