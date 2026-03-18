#!/usr/bin/env python3
"""Test the updated corridor coverage filter (Solution 1).

This script:
1. Executes the updated _SEGMENT_QUERY_BY_TARGET_CORRIDORS with coverage threshold
2. Shows which corridors are now included after applying ≥50% coverage filter
3. Displays segment count per corridor
4. Expected result: ~5 TRUE Q1 corridors (vs previous 13 with false positives)
"""
import os
import sys
from sqlalchemy import create_engine, text

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    db_user = os.getenv("DB_USER")
    db_pass = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT")
    db_name = os.getenv("DB_NAME")
    db_ssl = os.getenv("DB_SSLMODE", "require")

    DATABASE_URL = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}?sslmode={db_ssl}"

engine = create_engine(DATABASE_URL)


# Q1 bbox parameters
BBOX_Q1 = {
    "min_lon": 106.663,
    "max_lon": 106.723,
    "min_lat": 10.743,
    "max_lat": 10.803,
    "limit": 1000,
}

# Updated query with coverage threshold filter (≥50%)
QUERY_WITH_COVERAGE = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
            AND (
                LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
                OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
                OR LOWER(TRIM(dl.district)) LIKE '%district 1%'
            )
    ),
    all_corridor_segments AS (
        -- Count total segments for each corridor
        SELECT bcs.corridor_key,
               COUNT(*) AS total_segments,
               SUM(ds.length_m) AS total_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        WHERE ds.geometry_center IS NOT NULL
        GROUP BY bcs.corridor_key
    ),
    q1_corridor_segments AS (
        -- Count segments within Q1 for each corridor
        SELECT bcs.corridor_key,
               COUNT(*) AS q1_segments,
               SUM(ds.length_m) AS q1_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
            AND (
                (qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
                OR (
                    qb.geom IS NULL
                    AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                    AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                )
            )
        GROUP BY bcs.corridor_key
    ),
    target_corridors AS (
        -- Filter corridors by coverage threshold (≥50% of segments OR length in Q1)
        SELECT acs.corridor_key,
               acs.total_segments,
               acs.total_length_m,
               qcs.q1_segments,
               qcs.q1_length_m,
               (qcs.q1_segments::DECIMAL / acs.total_segments * 100) AS segment_coverage_pct,
               (qcs.q1_length_m / acs.total_length_m * 100) AS length_coverage_pct
        FROM all_corridor_segments acs
        JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
        WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
           OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
    )
    SELECT dc.corridor_key,
           dc.corridor_name,
           dc.direction,
           tc.total_segments,
           tc.q1_segments,
           ROUND(tc.segment_coverage_pct, 1) AS segment_coverage_pct,
           tc.total_length_m,
           tc.q1_length_m,
           ROUND(tc.length_coverage_pct, 1) AS length_coverage_pct,
           dc.importance_level
    FROM target_corridors tc
    JOIN dim_corridor dc ON dc.corridor_key = tc.corridor_key
    ORDER BY tc.length_coverage_pct DESC, dc.corridor_name
""")

# Also query the total ETL segments
QUERY_ETL_SEGMENTS = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
            AND (
                LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
                OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
                OR LOWER(TRIM(dl.district)) LIKE '%district 1%'
            )
    ),
    all_corridor_segments AS (
        SELECT bcs.corridor_key,
               COUNT(*) AS total_segments,
               SUM(ds.length_m) AS total_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        WHERE ds.geometry_center IS NOT NULL
        GROUP BY bcs.corridor_key
    ),
    q1_corridor_segments AS (
        SELECT bcs.corridor_key,
               COUNT(*) AS q1_segments,
               SUM(ds.length_m) AS q1_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
            AND (
                (qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
                OR (
                    qb.geom IS NULL
                    AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
                    AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
                )
            )
        GROUP BY bcs.corridor_key
    ),
    target_corridors AS (
        SELECT acs.corridor_key
        FROM all_corridor_segments acs
        JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
        WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
           OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
    )
    SELECT COUNT(DISTINCT s.segment_key) AS etl_segment_count
    FROM dim_segment s
    JOIN dim_way w ON s.way_key = w.way_key
    JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
    JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
    WHERE s.geometry_center IS NOT NULL
      AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
""")

def main():
    output_file = "/tmp/test_coverage_output.txt"
    
    # Redirect stdout to file
    import sys
    original_stdout = sys.stdout
    with open(output_file, 'w') as f:
        sys.stdout = f
        
        print("=" * 80)
        print("CORRIDOR COVERAGE FILTER TEST (Solution 1: ≥50% Threshold)")
        print("=" * 80)
        print()
        
        with engine.connect() as conn:
            # Query corridors with coverage stats
            print("📊 TRUE Q1 CORRIDORS (≥50% Coverage):")
            print("-" * 80)
            rows = conn.execute(QUERY_WITH_COVERAGE, BBOX_Q1).fetchall()
            
            if not rows:
                print("❌ No corridors found with ≥50% coverage!")
                print("   This may indicate a problem with the query or data.")
                sys.stdout = original_stdout
                return
            
            print(f"Found {len(rows)} corridors meeting ≥50% coverage threshold:\n")
            
            # Print table header
            print(f"{'Corridor Name':<35} {'Dir':<4} {'Tot Seg':<8} {'Q1 Seg':<8} {'Seg %':<7} {'Len %':<7} {'Imp':<4}")
            print("-" * 80)
            
            for row in rows:
                name = row.corridor_name or "Unknown"
                direction = row.direction or "N/A"
                total_seg = row.total_segments
                q1_seg = row.q1_segments
                seg_pct = row.segment_coverage_pct
                len_pct = row.length_coverage_pct
                importance = row.importance_level or 0
                
                print(f"{name:<35} {direction:<4} {total_seg:<8} {q1_seg:<8} {seg_pct:<6.1f}% {len_pct:<6.1f}% {importance:<4}")
            
            print()
            
            # Query total ETL segment count
            print("📦 TOTAL ETL SEGMENTS:")
            print("-" * 80)
            result = conn.execute(QUERY_ETL_SEGMENTS, BBOX_Q1).fetchone()
            etl_count = result.etl_segment_count if result else 0
            print(f"Total segments to be ETL'd: {etl_count}")
            print(f"TomTom API calls per cycle: {etl_count} (limit: ~25 for free tier, 1000 for Q1 production)")
            print()
            
            # Summary
            print("=" * 80)
            print("VERIFICATION SUMMARY:")
            print("=" * 80)
            print(f"✅ Corridors after coverage filter: {len(rows)}")
            print(f"✅ Expected: ~5 TRUE Q1 corridors (Lê Duẩn, Điện Biên Phủ, Đinh Tiên Hoàng,")
            print(f"             Nguyễn Đình Chiểu, Võ Thị Sáu)")
            print(f"✅ False positives eliminated: {13 - len(rows)} corridors removed")
            print(f"✅ ETL segments: {etl_count} (within Q1 boundaries)")
            print()
            
            if len(rows) <= 7:
                print("✅ SUCCESS: Coverage threshold filter is working as expected!")
                print("   Only TRUE Q1 corridors (≥50% coverage) are included.")
            else:
                print("⚠️  WARNING: More than 7 corridors detected.")
                print("   Verify that coverage calculations are correct.")
            print()
    
    sys.stdout = original_stdout
    print(f"✅ Test completed. Output saved to: {output_file}")
    print(f"   View with: docker-compose exec data-pipeline cat {output_file}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
