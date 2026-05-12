-- Test the updated corridor coverage filter (Solution 1)
-- Run with: docker-compose exec -T postgres psql -U traffic_user -d traffic_ioc_db -f /tmp/test_coverage.sql

\echo '================================================================================'
\echo 'CORRIDOR COVERAGE FILTER TEST (Solution 1: >= 50% Threshold)'
\echo '================================================================================'
\echo ''

-- Set Q1 bbox parameters
\set min_lon 106.663
\set max_lon 106.723
\set min_lat 10.743
\set max_lat 10.803

\echo 'TRUE Q1 CORRIDORS (>= 50% Coverage):'
\echo '--------------------------------------------------------------------------------'

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
           ROUND((qcs.q1_segments::DECIMAL / acs.total_segments * 100), 1) AS segment_coverage_pct,
           ROUND((qcs.q1_length_m / acs.total_length_m * 100), 1) AS length_coverage_pct
    FROM all_corridor_segments acs
    JOIN q1_corridor_segments qcs ON qcs.corridor_key = acs.corridor_key
    WHERE (qcs.q1_segments::DECIMAL / acs.total_segments >= 0.5)
       OR (qcs.q1_length_m / acs.total_length_m >= 0.5)
)
SELECT dc.corridor_name,
       dc.direction,
       tc.total_segments,
       tc.q1_segments,
       tc.segment_coverage_pct || '%' AS seg_cov,
       ROUND(tc.total_length_m::NUMERIC, 0) AS total_length_m,
       ROUND(tc.q1_length_m::NUMERIC, 0) AS q1_length_m,
       tc.length_coverage_pct || '%' AS len_cov,
       dc.importance_level
FROM target_corridors tc
JOIN dim_corridor dc ON dc.corridor_key = tc.corridor_key
ORDER BY tc.length_coverage_pct DESC, dc.corridor_name;

\echo ''
\echo '--------------------------------------------------------------------------------'
\echo 'TOTAL ETL SEGMENTS:'
\echo '--------------------------------------------------------------------------------'

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
  AND w.osm_highway_type IN ('primary','secondary','tertiary','trunk');

\echo ''
\echo '================================================================================'
\echo 'Test completed'
\echo '================================================================================'
