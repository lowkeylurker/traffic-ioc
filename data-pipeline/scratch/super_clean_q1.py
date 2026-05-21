from sqlalchemy import create_engine, text

db_url = 'postgresql://traffic_admin:dsCZ2yeV5LuW3dN@psql-smart-traffic-dev.postgres.database.azure.com:5432/traffic_ioc_db?sslmode=require'
engine = create_engine(db_url)

with engine.begin() as conn:
    # Strict cleanup: remove generic, internal, numbered, or empty road names
    cleanup_sql = text("""
        DELETE FROM dim_segment_q1 q1
        WHERE EXISTS (
            SELECT 1 
            FROM dim_segment s
            JOIN dim_way w ON s.way_key = w.way_key
            JOIN dim_road rd ON w.road_key = rd.road_key
            WHERE s.segment_key = q1.segment_key
              AND (
                  rd.name IS NULL 
                  OR TRIM(rd.name) = ''
                  OR rd.name ILIKE 'Đường không tên%'
                  OR rd.name ILIKE 'Đường nội bộ%'
                  OR rd.name ILIKE 'Đường số %'
                  OR rd.name ILIKE 'Đường Số %'
                  OR rd.name ILIKE 'Hẻm %'
                  OR rd.name ILIKE '% Hẻm %'
                  OR rd.name ILIKE 'Kiệt %'
                  OR rd.name ILIKE 'Ngách %'
                  OR rd.name ILIKE 'Unnamed%'
                  OR rd.name ILIKE 'No name%'
                  OR rd.name ILIKE 'Cầu số %'
                  OR rd.name ILIKE 'Cầu Số %'
              )
        )
    """)
    
    result = conn.execute(cleanup_sql)
    print(f"Super Clean cleanup finished. Removed {result.rowcount} generic/nameless segments.")
    
    # Final count
    final_count = conn.execute(text("SELECT COUNT(*) FROM dim_segment_q1")).scalar()
    print(f"Final super-clean segments in dim_segment_q1: {final_count}")
