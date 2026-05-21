import sys
sys.path.insert(0, "/app")
from src.core.database import get_engine
from sqlalchemy import text
import sys

e = get_engine()
with e.connect() as conn:
    # 1. Unnamed road check
    r = conn.execute(text("SELECT COUNT(*) FROM dim_road WHERE name = 'Đường không tên (TomTom)'")).scalar()
    print(f"Unnamed road records: {r}")
    
    # 2. Ways pointing to unnamed road
    w_unnamed = conn.execute(text("""
        SELECT COUNT(DISTINCT dw.way_key)
        FROM dim_way dw
        JOIN dim_road dr ON dw.road_key = dr.road_key
        WHERE dr.name = 'Đường không tên (TomTom)'
    """)).scalar()
    print(f"Ways marked as unnamed: {w_unnamed}")

    # 3. Ways with valid names
    ways_with_name = conn.execute(text("""
        SELECT COUNT(DISTINCT dw.way_key)
        FROM dim_way dw
        JOIN dim_road dr ON dw.road_key = dr.road_key
        WHERE dr.name IS NOT NULL AND dr.name != '' AND dr.name != 'nan' AND dr.name != 'Đường không tên (TomTom)'
    """)).scalar()
    print(f"Ways with valid names: {ways_with_name}")

    # 4. Ways still missing
    ways_missing = conn.execute(text("""
        SELECT COUNT(DISTINCT dw.way_key)
        FROM dim_way dw
        LEFT JOIN dim_road dr ON dw.road_key = dr.road_key
        WHERE dr.name IS NULL OR dr.name = '' OR dr.name = 'nan' OR dw.road_key IS NULL
    """)).scalar()
    print(f"Ways still missing: {ways_missing}")
