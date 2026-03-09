"""Report Q1 ETL corridors with strict relevance filters and impact scoring.

This script shows:
1) Baseline result (current broad logic)
2) Improved result using Q1 relevance rules:
   - Keep corridors with q1_length_pct >= 40%
   - Or gateway corridors with q1_length_pct >= 15% and min distance <= 1500m
   - Keep only segments inside Q1 or near Q1 boundary (<= 1500m)
3) Impact score ranking (traffic + incident + importance + Q1 coverage)

Run:
    docker-compose exec data-pipeline python scripts/show_q1_etl_corridors.py
"""

import os
os.environ.setdefault("DB_CONNECTION_STRING", "postgresql://traffic_admin:traffic_pass@postgres:5432/traffic_ioc")

from sqlalchemy import create_engine, text

Q1_LENGTH_THRESHOLD = 0.40
GATEWAY_LENGTH_THRESHOLD = 0.15
GATEWAY_DISTANCE_M = 1500

def main():
    engine = create_engine(os.environ["DB_CONNECTION_STRING"])

    # Baseline (current broad logic)
    baseline_query = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
          AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
               OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
    ),
    target_corridors AS (
        SELECT DISTINCT bcs.corridor_key
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
          AND ((qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
               OR (qb.geom IS NULL
                   AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
                   AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803))
    ),
    etl_segments AS (
        SELECT DISTINCT s.segment_key, bcs.corridor_key, s.length_m
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
        JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
        WHERE s.geometry_center IS NOT NULL
          AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    )
    SELECT
        c.corridor_key,
        c.corridor_name,
        c.importance_level,
        c.total_length_m,
        COUNT(DISTINCT es.segment_key) AS segments,
        ROUND(SUM(es.length_m)::numeric, 0) AS etl_length_m
    FROM dim_corridor c
    JOIN etl_segments es ON es.corridor_key = c.corridor_key
    GROUP BY c.corridor_key, c.corridor_name, c.importance_level, c.total_length_m
    ORDER BY c.importance_level ASC, segments DESC
    """)

    baseline_summary_query = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
          AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
               OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
    ),
    target_corridors AS (
        SELECT DISTINCT bcs.corridor_key
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
          AND ((qb.geom IS NOT NULL AND ST_Within(ds.geometry_center, qb.geom))
               OR (qb.geom IS NULL
                   AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
                   AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803))
    ),
    etl_segments AS (
        SELECT DISTINCT s.segment_key, bcs.corridor_key
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
        JOIN target_corridors tc ON tc.corridor_key = bcs.corridor_key
        WHERE s.geometry_center IS NOT NULL
          AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
    )
    SELECT COUNT(DISTINCT corridor_key) AS corridors, COUNT(DISTINCT segment_key) AS segments
    FROM etl_segments
    """)

    # Improved Q1 relevance + impact scoring
    improved_query = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
          AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
               OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
    ),
    all_corridor_segments AS (
        SELECT
            bcs.corridor_key,
            COUNT(DISTINCT bcs.segment_key) AS total_segments,
            SUM(ds.length_m) AS total_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        WHERE ds.geometry_center IS NOT NULL
        GROUP BY bcs.corridor_key
    ),
    q1_corridor_segments AS (
        SELECT
            bcs.corridor_key,
            COUNT(DISTINCT bcs.segment_key) AS q1_segments,
            SUM(ds.length_m) AS q1_length_m,
            MIN(
                CASE
                    WHEN qb.geom IS NOT NULL THEN ST_Distance(ds.geometry_center::geography, qb.geom::geography)
                    ELSE 0
                END
            ) AS min_dist_to_q1_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
          AND (
              (qb.geom IS NOT NULL AND ST_DWithin(ds.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
              OR (qb.geom IS NULL
                  AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
                  AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803)
          )
        GROUP BY bcs.corridor_key
    ),
    selected_corridors AS (
        SELECT
            acs.corridor_key,
            acs.total_segments,
            acs.total_length_m,
            COALESCE(qcs.q1_segments, 0) AS q1_segments,
            COALESCE(qcs.q1_length_m, 0) AS q1_length_m,
            COALESCE(qcs.min_dist_to_q1_m, 999999.0) AS min_dist_to_q1_m,
            COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) AS q1_length_pct
        FROM all_corridor_segments acs
        LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
        WHERE (
            COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :q1_length_threshold
            OR (
                COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :gateway_length_threshold
                AND COALESCE(qcs.min_dist_to_q1_m, 999999.0) <= :gateway_distance_m
            )
        )
    ),
    etl_segments AS (
        SELECT DISTINCT
            s.segment_key,
            bcs.corridor_key,
            s.length_m
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
        JOIN selected_corridors sc ON sc.corridor_key = bcs.corridor_key
        CROSS JOIN q1_boundary qb
        WHERE s.geometry_center IS NOT NULL
          AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
          AND (
              (qb.geom IS NOT NULL AND ST_DWithin(s.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
              OR (qb.geom IS NULL
                  AND ST_X(s.geometry_center) BETWEEN 106.663 AND 106.723
                  AND ST_Y(s.geometry_center) BETWEEN 10.743 AND 10.803)
          )
    ),
    traffic_stats AS (
        SELECT
            es.corridor_key,
            AVG(COALESCE(ftf.congestion_level, 0)) AS avg_congestion,
            AVG(
                CASE
                    WHEN COALESCE(ftf.free_flow_speed_kmh, 0) > 0
                    THEN GREATEST((ftf.free_flow_speed_kmh - COALESCE(ftf.current_speed_kmh, 0)) / ftf.free_flow_speed_kmh, 0)
                    ELSE 0
                END
            ) AS avg_speed_deficit
        FROM etl_segments es
        LEFT JOIN fact_traffic_flow ftf
            ON ftf.segment_key = es.segment_key
           AND ftf.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '14 days')
        GROUP BY es.corridor_key
    ),
    incident_stats AS (
        SELECT
            es.corridor_key,
            COUNT(fi.incident_key) AS incident_count,
            AVG(COALESCE(fi.severity_level, 0)) AS avg_incident_severity
        FROM etl_segments es
        LEFT JOIN fact_incident fi
            ON fi.segment_key = es.segment_key
           AND fi.timestamp >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
           AND COALESCE(fi.is_active, TRUE) = TRUE
        GROUP BY es.corridor_key
    ),
    corridor_metrics AS (
        SELECT
            c.corridor_key,
            c.corridor_name,
            c.importance_level,
            c.total_length_m,
            sc.q1_segments,
            ROUND(sc.q1_length_m::numeric, 0) AS q1_length_m,
            ROUND(sc.q1_length_pct::numeric * 100, 1) AS q1_length_pct,
            ROUND(sc.min_dist_to_q1_m::numeric, 0) AS min_dist_to_q1_m,
            COUNT(DISTINCT es.segment_key) AS etl_segments,
            ROUND(SUM(es.length_m)::numeric, 0) AS etl_length_m,
            COALESCE(ts.avg_congestion, 0) AS avg_congestion,
            COALESCE(ts.avg_speed_deficit, 0) AS avg_speed_deficit,
            COALESCE(ins.incident_count, 0) AS incident_count,
            COALESCE(ins.avg_incident_severity, 0) AS avg_incident_severity
        FROM dim_corridor c
        JOIN selected_corridors sc ON sc.corridor_key = c.corridor_key
        JOIN etl_segments es ON es.corridor_key = c.corridor_key
        LEFT JOIN traffic_stats ts ON ts.corridor_key = c.corridor_key
        LEFT JOIN incident_stats ins ON ins.corridor_key = c.corridor_key
        GROUP BY
            c.corridor_key,
            c.corridor_name,
            c.importance_level,
            c.total_length_m,
            sc.q1_segments,
            sc.q1_length_m,
            sc.q1_length_pct,
            sc.min_dist_to_q1_m,
            ts.avg_congestion,
            ts.avg_speed_deficit,
            ins.incident_count,
            ins.avg_incident_severity
    ),
    normalized AS (
        SELECT
            cm.*,
            COALESCE(cm.q1_length_pct / 100.0, 0) AS cov_score,
            COALESCE(cm.avg_congestion / 5.0, 0) AS cong_score,
            COALESCE(cm.avg_speed_deficit, 0) AS speed_deficit_score,
            COALESCE(cm.incident_count::decimal / NULLIF(MAX(cm.incident_count) OVER (), 0), 0) AS incident_score,
            COALESCE(cm.avg_incident_severity / 5.0, 0) AS severity_score,
            COALESCE((6 - cm.importance_level)::decimal / 5.0, 0) AS importance_score
        FROM corridor_metrics cm
    )
    SELECT
        corridor_key,
        corridor_name,
        importance_level,
        etl_segments,
        etl_length_m,
        total_length_m,
        q1_length_pct,
        min_dist_to_q1_m,
        ROUND(avg_congestion::numeric, 2) AS avg_congestion,
        incident_count,
        ROUND(
            (
                0.40 * cov_score
              + 0.25 * cong_score
              + 0.15 * speed_deficit_score
              + 0.15 * incident_score
              + 0.05 * importance_score
            )::numeric,
            4
        ) AS q1_impact_score
    FROM normalized
    ORDER BY q1_impact_score DESC, q1_length_pct DESC, etl_segments DESC
    """)

    improved_summary_query = text("""
    WITH q1_boundary AS (
        SELECT ST_UnaryUnion(ST_Collect(dl.geometry_polygon)) AS geom
        FROM dim_location dl
        WHERE dl.geometry_polygon IS NOT NULL
          AND (LOWER(TRIM(dl.district)) IN ('quan 1', 'district 1', 'q1')
               OR LOWER(TRIM(dl.district)) LIKE '%quan 1%')
    ),
    all_corridor_segments AS (
        SELECT bcs.corridor_key, SUM(ds.length_m) AS total_length_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        WHERE ds.geometry_center IS NOT NULL
        GROUP BY bcs.corridor_key
    ),
    q1_corridor_segments AS (
        SELECT
            bcs.corridor_key,
            SUM(ds.length_m) AS q1_length_m,
            MIN(
                CASE
                    WHEN qb.geom IS NOT NULL THEN ST_Distance(ds.geometry_center::geography, qb.geom::geography)
                    ELSE 0
                END
            ) AS min_dist_to_q1_m
        FROM bridge_corridor_segment bcs
        JOIN dim_segment ds ON ds.segment_key = bcs.segment_key
        CROSS JOIN q1_boundary qb
        WHERE ds.geometry_center IS NOT NULL
          AND (
              (qb.geom IS NOT NULL AND ST_DWithin(ds.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
              OR (qb.geom IS NULL
                  AND ST_X(ds.geometry_center) BETWEEN 106.663 AND 106.723
                  AND ST_Y(ds.geometry_center) BETWEEN 10.743 AND 10.803)
          )
        GROUP BY bcs.corridor_key
    ),
    selected_corridors AS (
        SELECT acs.corridor_key
        FROM all_corridor_segments acs
        LEFT JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
        WHERE (
            COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :q1_length_threshold
            OR (
                COALESCE(qcs.q1_length_m / NULLIF(acs.total_length_m, 0), 0.0) >= :gateway_length_threshold
                AND COALESCE(qcs.min_dist_to_q1_m, 999999.0) <= :gateway_distance_m
            )
        )
    ),
    etl_segments AS (
        SELECT DISTINCT s.segment_key, bcs.corridor_key
        FROM dim_segment s
        JOIN dim_way w ON s.way_key = w.way_key
        JOIN bridge_corridor_segment bcs ON bcs.segment_key = s.segment_key
        JOIN selected_corridors sc ON sc.corridor_key = bcs.corridor_key
        CROSS JOIN q1_boundary qb
        WHERE s.geometry_center IS NOT NULL
          AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk')
          AND (
              (qb.geom IS NOT NULL AND ST_DWithin(s.geometry_center::geography, qb.geom::geography, :gateway_distance_m))
              OR (qb.geom IS NULL
                  AND ST_X(s.geometry_center) BETWEEN 106.663 AND 106.723
                  AND ST_Y(s.geometry_center) BETWEEN 10.743 AND 10.803)
          )
    )
    SELECT COUNT(DISTINCT corridor_key) AS corridors, COUNT(DISTINCT segment_key) AS segments
    FROM etl_segments
    """)
    
    print("\n" + "=" * 130)
    print("CORRIDOR SELECTION FOR QUAN 1 - BASELINE VS IMPROVED")
    print("Improved mode: q1_len>=40% OR gateway(q1_len>=15% & dist<=1500m), with Q1 impact score")
    print("=" * 130)
    
    # Tạo output file
    output_file = "/tmp/q1_etl_corridors_improved.txt"
    
    with engine.connect() as conn:
        params = {
            "q1_length_threshold": Q1_LENGTH_THRESHOLD,
            "gateway_length_threshold": GATEWAY_LENGTH_THRESHOLD,
            "gateway_distance_m": GATEWAY_DISTANCE_M,
        }

        baseline_results = conn.execute(baseline_query).fetchall()
        baseline_summary = conn.execute(baseline_summary_query).fetchone()

        improved_results = conn.execute(improved_query, params).fetchall()
        improved_summary = conn.execute(improved_summary_query, params).fetchone()
        
        # Write to both console and file
        output_lines = []
        output_lines.append("")
        output_lines.append("A) BASELINE (CURRENT BROAD LOGIC)")
        output_lines.append("-" * 130)
        output_lines.append(
            f"{'STT':<5} {'Corridor Name':<56} {'Imp':<5} {'Segments':<10} {'ETL Length':<15} {'Total Length':<15}"
        )
        output_lines.append("-" * 130)
        
        for idx, row in enumerate(baseline_results, 1):
            corridor_name = row[1]
            importance = row[2]
            total_length = float(row[3]) if row[3] else 0
            segments = row[4]
            etl_length_m = float(row[5])
            line = f"{idx:<5} {corridor_name:<56} {importance:<5} {segments:<10} {etl_length_m:>14,.0f} {total_length:>14,.0f}"
            output_lines.append(line)

        output_lines.append("-" * 130)
        output_lines.append(f"BASELINE TOTAL: {baseline_summary[0]} corridors | {baseline_summary[1]} segments")

        output_lines.append("")
        output_lines.append("B) IMPROVED (Q1 RELEVANCE + IMPACT SCORE)")
        output_lines.append("-" * 130)
        output_lines.append(
            f"{'STT':<5} {'Corridor Name':<44} {'Imp':<5} {'Seg':<6} {'Q1Len%':<8} {'Dist(m)':<8} {'Cong':<6} {'Inc':<5} {'Impact':<8}"
        )
        output_lines.append("-" * 130)

        for idx, row in enumerate(improved_results, 1):
            corridor_name = row[1]
            importance = row[2]
            segments = row[3]
            q1_length_pct = float(row[6]) if row[6] is not None else 0
            min_dist_m = float(row[7]) if row[7] is not None else 0
            avg_congestion = float(row[8]) if row[8] is not None else 0
            incident_count = int(row[9]) if row[9] is not None else 0
            impact_score = float(row[10]) if row[10] is not None else 0
            line = (
                f"{idx:<5} {corridor_name:<44} {importance:<5} {segments:<6} "
                f"{q1_length_pct:>6.1f}% {min_dist_m:>8.0f} {avg_congestion:>6.2f} {incident_count:>5} {impact_score:>8.4f}"
            )
            output_lines.append(line)

        output_lines.append("-" * 130)
        output_lines.append(f"IMPROVED TOTAL: {improved_summary[0]} corridors | {improved_summary[1]} segments")
        output_lines.append(
            f"EFFECT: corridors reduced by {baseline_summary[0] - improved_summary[0]}, "
            f"segments reduced by {baseline_summary[1] - improved_summary[1]}"
        )
        output_lines.append("=" * 130)
        
        # Print to console
        for line in output_lines:
            print(line)
        
        # Write to file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("\n".join(output_lines))
        
        print(f"\nĐã lưu vào: {output_file}")
        print("Lưu ý: Bảng IMPROVED ưu tiên corridor thực sự liên quan đến Quận 1.")
        print()

if __name__ == "__main__":
    main()
