"""Quick script to check segments in dim_segment table."""
from pathlib import Path
import sys

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.database import get_engine

engine = get_engine()

with engine.connect() as conn:
    # Check total segments
    result = conn.execute(text("SELECT COUNT(*) FROM dim_segment"))
    total = result.scalar()
    print(f"\n📊 Total segments in dim_segment: {total}")
    
    # Get sample segments with their source IDs
    result = conn.execute(text("""
        SELECT segment_key, segment_id_source, from_node_key, to_node_key, way_key, length_m
        FROM dim_segment
        ORDER BY segment_key
        LIMIT 15
    """))
    
    print("\n🔍 Sample segments (first 15):")
    print("-" * 120)
    print(f"{'segment_key':<20} {'segment_id_source':<20} {'from_node':<15} {'to_node':<15} {'way_key':<15} {'length_m':<10}")
    print("-" * 120)
    
    for row in result:
        print(f"{row.segment_key:<20} {row.segment_id_source:<20} {row.from_node_key:<15} {row.to_node_key:<15} {row.way_key:<15} {row.length_m:<10.2f}")
    
    # Check if any segment has segment_id_source matching corridor config
    corridor_refs = [817909615, 817909616, 817909617, 817909618, 817909619]
    placeholders = ", ".join([f":ref{i}" for i in range(len(corridor_refs))])
    result = conn.execute(
        text(f"SELECT segment_key, segment_id_source FROM dim_segment WHERE segment_id_source IN ({placeholders})"),
        {f"ref{i}": ref for i, ref in enumerate(corridor_refs)}
    )
    
    matches = list(result)
    print(f"\n🔍 Segments matching corridor config references: {len(matches)}")
    if matches:
        for row in matches:
            print(f"  segment_key={row.segment_key}, segment_id_source={row.segment_id_source}")
    else:
        print("  ❌ No matches found - corridor config needs to be updated!")
    
    # Get some actual segment_id_source values to use
    result = conn.execute(text("""
        SELECT DISTINCT segment_id_source 
        FROM dim_segment 
        WHERE segment_id_source IS NOT NULL 
        ORDER BY segment_id_source 
        LIMIT 10
    """))
    
    print("\n✅ Available segment_id_source values (use these in corridor config):")
    available = [row.segment_id_source for row in result]
    for sid in available:
        print(f"  - {sid}")

print("\n✅ Check complete\n")
