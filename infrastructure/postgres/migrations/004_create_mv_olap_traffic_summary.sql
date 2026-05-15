-- OLAP materialized view for BI dashboard (no weather dependency)
-- Updated to include osm_highway_type for filtering

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
    COALESCE(dl.district, 'N/A') AS district,
    COALESCE(dw.design_capacity, 0) AS design_capacity,
    dw.osm_highway_type, -- Added for filtering
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
    LEFT JOIN dim_location dl ON dl.location_key = ds.location_key
    INNER JOIN dim_way dw ON dw.way_key = ds.way_key
    INNER JOIN dim_road dr ON dr.road_key = dw.road_key
    INNER JOIN dim_time_of_day dt ON dt.time_key = ftf.time_key
WHERE
    COALESCE(
        dt.bucket_60min_key,
        FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int
    ) BETWEEN 0 AND 23
    AND dw.osm_highway_type IN ('primary', 'trunk', 'secondary')
GROUP BY
    ftf.segment_key,
    segment_id,
    road_name,
    district,
    dw.design_capacity,
    dw.osm_highway_type,
    hour_of_day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_olap_traffic_summary_unique ON mv_olap_traffic_summary (segment_key, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_mv_olap_traffic_summary_district ON mv_olap_traffic_summary (district);