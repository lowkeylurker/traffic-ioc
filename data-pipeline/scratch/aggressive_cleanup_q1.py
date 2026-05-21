from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

with engine.begin() as conn:
    # Aggressive cleanup: remove any segment that doesn't have a valid, substantial name
    cleanup_sql = text("""
        DELETE FROM dim_segment_q1 q1
        WHERE NOT EXISTS (
            SELECT 1 
            FROM dim_segment s
            JOIN dim_way w ON s.way_key = w.way_key
            JOIN dim_road rd ON w.road_key = rd.road_key
            WHERE s.segment_key = q1.segment_key
              AND rd.name IS NOT NULL 
              AND TRIM(rd.name) != ''
              AND length(TRIM(rd.name)) > 1
              AND rd.name NOT ILIKE 'Hẻm %'
              AND rd.name NOT ILIKE '% Hẻm %'
              AND rd.name NOT ILIKE 'Unnamed%'
        )
    """)
    
    result = conn.execute(cleanup_sql)
    print(f"Aggressive cleanup finished. Removed {result.rowcount} suspicious segments.")
    
    # Final count
    final_count = conn.execute(text("SELECT COUNT(*) FROM dim_segment_q1")).scalar()
    print(f"Final clean segments in dim_segment_q1: {final_count}")
