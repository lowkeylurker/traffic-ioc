-- OLAP materialized view for BI dashboard (no weather dependency)
-- Noise filtering principle:
-- - Source starts from fact_traffic_flow (live traffic only)
-- - INNER JOIN to dimensions ensures only roads/segments with real live data are included
-- - No weather attributes are used anywhere in this view

DROP MATERIALIZED VIEW IF EXISTS mv_olap_traffic_summary;

CREATE MATERIALIZED VIEW mv_olap_traffic_summary AS
SELECT
    ftf.segment_key,
    COALESCE(
        ds.segment_id_source,
        ftf.segment_key
    ) AS segment_id,
    COALESCE(
        dr.name,
        CONCAT('Road-', ds.way_key::text)
    ) AS road_name,
    COALESCE(dw.design_capacity, 0) AS design_capacity,
    COALESCE(
        dt.bucket_60min_key,
        FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int
    ) AS hour_of_day,
    AVG(ftf.traffic_index)::float8 AS avg_traffic_index,
    AVG(ftf.pcu_volume)::float8 AS avg_pcu_volume,
    AVG(ftf.delay_seconds)::float8 AS avg_delay_seconds
FROM
    fact_traffic_flow ftf
    INNER JOIN dim_segment ds ON ds.segment_key = ftf.segment_key
    INNER JOIN dim_way dw ON dw.way_key = ds.way_key
    INNER JOIN dim_road dr ON dr.road_key = dw.road_key
    INNER JOIN dim_time_of_day dt ON dt.time_key = ftf.time_key
WHERE
    COALESCE(
        dt.bucket_60min_key,
        FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int
    ) BETWEEN 0 AND 23
GROUP BY
    ftf.segment_key,
    COALESCE(
        ds.segment_id_source,
        ftf.segment_key
    ),
    COALESCE(
        dr.name,
        CONCAT('Road-', ds.way_key::text)
    ),
    COALESCE(dw.design_capacity, 0),
    COALESCE(
        dt.bucket_60min_key,
        FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_olap_traffic_summary_unique ON mv_olap_traffic_summary (segment_key, hour_of_day);