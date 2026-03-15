"""
Phân tích Q1 coverage của các corridors để tìm false positives.
"""

import os
os.environ.setdefault("DB_CONNECTION_STRING", "postgresql://traffic_admin:traffic_pass@postgres:5432/traffic_ioc")

from sqlalchemy import create_engine, text

def main():
    engine = create_engine(os.environ["DB_CONNECTION_STRING"])
    
    # Query để phân tích coverage
    analysis_query = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
          AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
               OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
    ),
    -- Tất cả segments của mỗi corridor
    all_corridor_segments AS (
        SELECT 
            bcs.corridor_key,
            COUNT(DISTINCT bcs.segment_key) AS total_segments,
            SUM(s.length_m) AS total_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment s ON s.segment_key = bcs.segment_key
        GROUP BY bcs.corridor_key
    ),
    -- Segments thuộc Q1 của mỗi corridor
    q1_corridor_segments AS (
        SELECT 
            bcs.corridor_key,
            COUNT(DISTINCT bcs.segment_key) AS q1_segments,
            SUM(s.length_m) AS q1_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment s ON s.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE s.geometry_center IS NOT NULL
          AND ((qb.geom IS NOT NULL AND ST_Within(s.geometry_center, qb.geom))
               OR (qb.geom IS NULL
                   AND ST_X(s.geometry_center) BETWEEN 106.663 AND 106.723
                   AND ST_Y(s.geometry_center) BETWEEN 10.743 AND 10.803))
        GROUP BY bcs.corridor_key
    ),
    -- Segments sẽ được ETL (thêm highway type filter)
    etl_segments AS (
        SELECT 
            bcs.corridor_key,
            COUNT(DISTINCT bcs.segment_key) AS etl_segments,
            SUM(s.length_m) AS etl_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment s ON s.segment_key = bcs.segment_key
        JOIN dim_way w ON w.way_key = s.way_key
        CROSS JOIN q1_boundary qb
        WHERE s.geometry_center IS NOT NULL
          AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
          AND ((qb.geom IS NOT NULL AND ST_Within(s.geometry_center, qb.geom))
               OR (qb.geom IS NULL
                   AND ST_X(s.geometry_center) BETWEEN 106.663 AND 106.723
                   AND ST_Y(s.geometry_center) BETWEEN 10.743 AND 10.803))
        GROUP BY bcs.corridor_key
    )
    SELECT 
        c.corridor_key,
        c.corridor_name,
        c.importance_level,
        acs.total_segments,
        COALESCE(qcs.q1_segments, 0) AS q1_segments,
        COALESCE(es.etl_segments, 0) AS etl_segments,
        ROUND(acs.total_length_m::numeric, 0) AS total_length_m,
        ROUND(COALESCE(qcs.q1_length_m, 0)::numeric, 0) AS q1_length_m,
        ROUND(COALESCE(es.etl_length_m, 0)::numeric, 0) AS etl_length_m,
        ROUND((COALESCE(qcs.q1_segments, 0)::float / NULLIF(acs.total_segments, 0) * 100)::numeric, 1) AS q1_segment_pct,
        ROUND((COALESCE(qcs.q1_length_m, 0) / NULLIF(acs.total_length_m, 0) * 100)::numeric, 1) AS q1_length_pct,
        CASE 
            WHEN COALESCE(qcs.q1_segments, 0) = 0 THEN 'NO Q1 PRESENCE'
            WHEN COALESCE(qcs.q1_length_m, 0) / NULLIF(acs.total_length_m, 0) >= 0.5 THEN 'TRUE Q1'
            WHEN COALESCE(qcs.q1_length_m, 0) / NULLIF(acs.total_length_m, 0) >= 0.2 THEN 'PARTIAL Q1'
            ELSE 'FALSE POSITIVE'
        END AS classification
    FROM dim_corridor c
    JOIN all_corridor_segments acs ON acs.corridor_key = c.corridor_key
    LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = c.corridor_key
    LEFT JOIN etl_segments es ON es.corridor_key = c.corridor_key
    WHERE COALESCE(es.etl_segments, 0) > 0  -- Chỉ lấy corridors sẽ được ETL
    ORDER BY 
        CASE 
            WHEN COALESCE(qcs.q1_length_m, 0) / NULLIF(acs.total_length_m, 0) >= 0.5 THEN 1
            WHEN COALESCE(qcs.q1_length_m, 0) / NULLIF(acs.total_length_m, 0) >= 0.2 THEN 2
            ELSE 3
        END,
        q1_length_pct DESC
    """)
    
    print("\n" + "="*130)
    print("PHÂN TÍCH Q1 COVERAGE CỦA CÁC CORRIDORS")
    print("="*130)
    
    with engine.connect() as conn:
        results = conn.execute(analysis_query).fetchall()
        
        print(f"\n{'STT':<4} {'Corridor Name':<42} {'Imp':<4} {'Total':<7} {'Q1':<7} {'ETL':<7} {'Q1%Seg':<8} {'Q1%Len':<8} {'Classification':<15}")
        print("-" * 130)
        
        true_q1 = []
        partial_q1 = []
        false_positive = []
        
        for idx, row in enumerate(results, 1):
            corridor_name = row[1]
            importance = row[2]
            total_seg = row[3]
            q1_seg = row[4]
            etl_seg = row[5]
            total_len = row[6]
            q1_len = row[7]
            etl_len = row[8]
            q1_seg_pct = float(row[9])
            q1_len_pct = float(row[10])
            classification = row[11]
            
            print(f"{idx:<4} {corridor_name:<42} {importance:<4} {total_seg:<7} {q1_seg:<7} {etl_seg:<7} {q1_seg_pct:>6.1f}% {q1_len_pct:>6.1f}% {classification:<15}")
            
            if classification == 'TRUE Q1':
                true_q1.append(corridor_name)
            elif classification == 'PARTIAL Q1':
                partial_q1.append(corridor_name)
            else:
                false_positive.append(corridor_name)
        
        print("=" * 130)
        print(f"\nTÓM TẮT:")
        print(f"  TRUE Q1 (≥50% length): {len(true_q1)} corridors")
        print(f"  PARTIAL Q1 (20-50%): {len(partial_q1)} corridors")
        print(f"  FALSE POSITIVE (<20%): {len(false_positive)} corridors")
        print(f"  TỔNG: {len(results)} corridors\n")
        
        if false_positive:
            print("❌ FALSE POSITIVES (corridors không thực sự thuộc Q1):")
            for name in false_positive:
                print(f"   - {name}")
        
        print("\n" + "="*130)
        print("VẤN ĐỀ PHÁT HIỆN:")
        print("  1. Corridor generation tạo corridors cho TOÀN THÀNH PHỐ (không filter theo quận)")
        print("  2. Một corridor dài (VD: Võ Văn Kiệt) có thể chỉ có vài segments chạm Q1")
        print("  3. Query ETL filter segments theo Q1 → nhặt được vài segments → corridor xuất hiện")
        print("  4. Result: Corridors không thuộc Q1 vẫn nằm trong list ETL")
        print("\nGIẢI PHÁP ĐỀ XUẤT:")
        print("  → Thêm threshold filter: Chỉ ETL corridors có ≥50% length hoặc ≥50% segments trong Q1")
        print("="*130 + "\n")

if __name__ == "__main__":
    main()
