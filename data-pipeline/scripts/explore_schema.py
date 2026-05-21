"""Task 1: DB schema exploration for dim_road, dim_way, dim_segment, dim_corridor."""
import sys
sys.path.insert(0, "/app")

from src.core.database import get_engine
from sqlalchemy import text

e = get_engine()
conn = e.connect()

TABLES = ["dim_road", "dim_way", "dim_segment", "dim_corridor"]

for t in TABLES:
    print(f"\n{'='*60}")
    print(f"  TABLE: {t}")
    print(f"{'='*60}")

    cols = conn.execute(text(
        "SELECT column_name, data_type, is_nullable "
        "FROM information_schema.columns "
        "WHERE table_name = :t ORDER BY ordinal_position"
    ), {"t": t}).fetchall()
    print(f"{'COLUMN':<35} {'TYPE':<25} NULLABLE")
    print("-" * 65)
    for c in cols:
        print(f"  {c[0]:<33} {c[1]:<25} {c[2]}")

    print(f"\n--- 3 sample rows ---")
    rows = conn.execute(text(f"SELECT * FROM {t} LIMIT 3")).fetchall()
    for r in rows:
        # truncate binary geometry columns
        r_clean = []
        for v in r:
            if isinstance(v, (bytes, memoryview)):
                r_clean.append("<binary>")
            elif isinstance(v, str) and len(v) > 60:
                r_clean.append(v[:60] + "...")
            else:
                r_clean.append(v)
        print(" ", tuple(r_clean))

print("\n\n" + "="*60)
print("  COVERAGE STATS")
print("="*60)

total_seg   = conn.execute(text("SELECT COUNT(1) FROM dim_segment")).scalar()
total_ways  = conn.execute(text("SELECT COUNT(1) FROM dim_way")).scalar()
total_roads = conn.execute(text("SELECT COUNT(1) FROM dim_road")).scalar()

roads_missing = conn.execute(text(
    "SELECT COUNT(1) FROM dim_road WHERE name IS NULL OR name = '' OR name = 'nan'"
)).scalar()

segs_no_road = conn.execute(text(
    "SELECT COUNT(DISTINCT ds.segment_key) "
    "FROM dim_segment ds "
    "JOIN dim_way dw ON ds.way_key = dw.way_key "
    "WHERE dw.road_key IS NULL"
)).scalar()

segs_with_name = conn.execute(text(
    "SELECT COUNT(DISTINCT ds.segment_key) "
    "FROM dim_segment ds "
    "JOIN dim_way dw ON ds.way_key = dw.way_key "
    "JOIN dim_road dr ON dw.road_key = dr.road_key "
    "WHERE dr.name IS NOT NULL AND dr.name != '' AND dr.name != 'nan'"
)).scalar()

segs_null_road = conn.execute(text(
    "SELECT COUNT(DISTINCT ds.segment_key) "
    "FROM dim_segment ds "
    "JOIN dim_way dw ON ds.way_key = dw.way_key "
    "JOIN dim_road dr ON dw.road_key = dr.road_key "
    "WHERE dr.name IS NULL OR dr.name = '' OR dr.name = 'nan'"
)).scalar()

print(f"  total_segments       : {total_seg:>10,}")
print(f"  total_ways           : {total_ways:>10,}")
print(f"  total_roads          : {total_roads:>10,}")
print(f"  roads_missing_name   : {roads_missing:>10,}  ({roads_missing*100//max(1,total_roads)}%)")
print(f"  segments_no_road_key : {segs_no_road:>10,}  (dim_way.road_key IS NULL)")
print(f"  segments_with_name   : {segs_with_name:>10,}  (road_name filled)")
print(f"  segments_null_name   : {segs_null_road:>10,}  (road_name empty — need geocode)")
print(f"\n  → API calls needed   : {segs_null_road + segs_no_road:>10,}")
print(f"    (unique ways only)  : checking...")

unique_ways_needed = conn.execute(text(
    "SELECT COUNT(DISTINCT ds.way_key) "
    "FROM dim_segment ds "
    "JOIN dim_way dw ON ds.way_key = dw.way_key "
    "LEFT JOIN dim_road dr ON dw.road_key = dr.road_key "
    "WHERE dr.road_name IS NULL OR dr.road_name = '' OR dr.road_key IS NULL"
)).scalar()
print(f"    → {unique_ways_needed:,} unique ways (1 API call per way, not per segment)")

conn.close()
