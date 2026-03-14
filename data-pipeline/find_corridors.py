"""Find real corridor segments from dim_segment for HCM routes."""
from sqlalchemy import text
from src.core.database import get_engine

engine = get_engine()

with engine.connect() as conn:
    # Find segments on major HCM roads (Nam Ky Khoi Nghia, Le Loi, etc.)
    # We'll look for segments from dim_way first to get way_key
    
    result = conn.execute(text("""
        SELECT 
            w.way_key,
            w.osm_highway_type,
            r.name as road_name,
            w.total_length_m,
            w.segment_count
        FROM dim_way w
        JOIN dim_road r ON w.road_key = r.road_key
        WHERE r.name ILIKE '%nam k%'
           OR r.name ILIKE '%lê l%'
           OR r.name ILIKE '%le loi%'
           OR r.name ILIKE '%võ văn kiệt%'
           OR r.name ILIKE '%đinh tiên hoàng%'
        ORDER BY w.total_length_m DESC
        LIMIT 10
    """))
    
    print("\n🛣️  Major roads found:")
    print("-" * 100)
    ways = []
    for row in result:
        print(f"Way {row.way_key}: {row.road_name} ({row.osm_highway_type}) - {row.segment_count} segments, {row.total_length_m:.0f}m")
        ways.append(row.way_key)
    
    if not ways:
        print("\n⚠️  No major roads found with those names. Trying top roads by segment count...\n")
        result = conn.execute(text("""
            SELECT 
                w.way_key,
                w.osm_highway_type,
                r.name as road_name,
                w.total_length_m,
                w.segment_count
            FROM dim_way w
            JOIN dim_road r ON w.road_key = r.road_key
            WHERE w.segment_count >= 3
              AND w.osm_highway_type IN ('primary', 'trunk', 'secondary')
            ORDER BY w.segment_count DESC, w.total_length_m DESC
            LIMIT 5
        """))
        
        print("🛣️  Top roads by segment count:")
        print("-" * 100)
        ways = []
        for row in result:
            print(f"Way {row.way_key}: {row.road_name} ({row.osm_highway_type}) - {row.segment_count} segments, {row.total_length_m:.0f}m")
            ways.append(row.way_key)
    
    # Get segments for first 2 ways
    if len(ways) >= 2:
        print(f"\n📍 Getting segments for way_key={ways[0]} (first corridor)...")
        result = conn.execute(text("""
            SELECT segment_key, segment_id_source, from_node_key, to_node_key, length_m
            FROM dim_segment
            WHERE way_key = :way_key
            ORDER BY from_node_key
            LIMIT 5
        """), {"way_key": ways[0]})
        
        corridor1_segs = []
        print("  Segments:")
        for i, row in enumerate(result, 1):
            print(f"    {i}. segment_key={row.segment_key}, source={row.segment_id_source}, length={row.length_m:.1f}m")
            corridor1_segs.append({
                "segment_key": row.segment_key,
                "segment_id_source": row.segment_id_source,
                "sequence_order": i
            })
        
        print(f"\n📍 Getting segments for way_key={ways[1]} (second corridor)...")
        result = conn.execute(text("""
            SELECT segment_key, segment_id_source, from_node_key, to_node_key, length_m
            FROM dim_segment
            WHERE way_key = :way_key
            ORDER BY from_node_key
            LIMIT 3
        """), {"way_key": ways[1]})
        
        corridor2_segs = []
        print("  Segments:")
        for i, row in enumerate(result, 1):
            print(f"    {i}. segment_key={row.segment_key}, source={row.segment_id_source}, length={row.length_m:.1f}m")
            corridor2_segs.append({
                "segment_key": row.segment_key,
                "segment_id_source": row.segment_id_source,
                "sequence_order": i
            })
        
        # Print Python config format
        print("\n" + "=" * 100)
        print("✅ Updated corridor config (paste into corridor_pipeline.py):\n")
        print("corridors_data = [")
        print("    {")
        print('        "corridor_name": "Corridor 1 (Primary Route)",')
        print('        "importance_level": 3,')
        print('        "target_avg_speed": 45.0,')
        print(f'        "total_length_m": {sum(s["segment_key"] for s in corridor1_segs)},')  # placeholder
        print('        "direction": "Inbound",')
        print('        "segments": [')
        for seg in corridor1_segs:
            print(f'            {{"segment_id_source": {seg["segment_id_source"]}, "sequence_order": {seg["sequence_order"]}}},')
        print('        ],')
        print('    },')
        print("    {")
        print('        "corridor_name": "Corridor 2 (Secondary Route)",')
        print('        "importance_level": 2,')
        print('        "target_avg_speed": 50.0,')
        print(f'        "total_length_m": {sum(s["segment_key"] for s in corridor2_segs)},')  # placeholder
        print('        "direction": "East-West",')
        print('        "segments": [')
        for seg in corridor2_segs:
            print(f'            {{"segment_id_source": {seg["segment_id_source"]}, "sequence_order": {seg["sequence_order"]}}},')
        print('        ],')
        print('    },')
        print("]")

print("\n✅ Complete\n")
