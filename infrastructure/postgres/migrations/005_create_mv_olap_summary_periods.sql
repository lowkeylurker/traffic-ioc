-- 005_create_mv_olap_summary_periods.sql
-- Cung cấp các Materialized View tổng hợp theo chu kỳ Tuần/Tháng để tăng tốc độ truy vấn cho OlapDashboard
-- Đã bổ sung osm_highway_type để hỗ trợ lọc theo loại đường trên Dashboard

-- 1. Weekly View (7 ngày gần nhất)
DROP MATERIALIZED VIEW IF EXISTS mv_olap_traffic_summary_weekly;
CREATE MATERIALIZED VIEW mv_olap_traffic_summary_weekly AS
SELECT
    ftf.segment_key,
    COALESCE(ds.segment_id_source, ftf.segment_key) AS segment_id,
    COALESCE(dr.name, CONCAT('Road-', ds.way_key::text)) AS road_name,
    COALESCE(dl.district, 'N/A') AS district,
    COALESCE(dw.design_capacity, 0) AS design_capacity,
    dw.osm_highway_type, -- Thêm để hỗ trợ bộ lọc
    COALESCE(dt.bucket_60min_key, FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int) AS hour_of_day,
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
    ftf.timestamp >= NOW() - INTERVAL '7 days'
    AND COALESCE(dt.bucket_60min_key, FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int) BETWEEN 0 AND 23
    AND dw.osm_highway_type IN ('primary', 'trunk', 'secondary')
GROUP BY
    ftf.segment_key, segment_id, road_name, district, dw.design_capacity, dw.osm_highway_type, hour_of_day;

CREATE UNIQUE INDEX idx_mv_olap_traffic_summary_weekly_unique ON mv_olap_traffic_summary_weekly (segment_key, hour_of_day);
CREATE INDEX idx_mv_olap_traffic_summary_weekly_district ON mv_olap_traffic_summary_weekly (district);

-- 2. Monthly View (30 ngày gần nhất)
DROP MATERIALIZED VIEW IF EXISTS mv_olap_traffic_summary_monthly;
CREATE MATERIALIZED VIEW mv_olap_traffic_summary_monthly AS
SELECT
    ftf.segment_key,
    COALESCE(ds.segment_id_source, ftf.segment_key) AS segment_id,
    COALESCE(dr.name, CONCAT('Road-', ds.way_key::text)) AS road_name,
    COALESCE(dl.district, 'N/A') AS district,
    COALESCE(dw.design_capacity, 0) AS design_capacity,
    dw.osm_highway_type, -- Thêm để hỗ trợ bộ lọc
    COALESCE(dt.bucket_60min_key, FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int) AS hour_of_day,
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
    ftf.timestamp >= NOW() - INTERVAL '30 days'
    AND COALESCE(dt.bucket_60min_key, FLOOR(COALESCE(dt.hhmm, 0) / 100.0)::int) BETWEEN 0 AND 23
    AND dw.osm_highway_type IN ('primary', 'trunk', 'secondary')
GROUP BY
    ftf.segment_key, segment_id, road_name, district, dw.design_capacity, dw.osm_highway_type, hour_of_day;

CREATE UNIQUE INDEX idx_mv_olap_traffic_summary_monthly_unique ON mv_olap_traffic_summary_monthly (segment_key, hour_of_day);
CREATE INDEX idx_mv_olap_traffic_summary_monthly_district ON mv_olap_traffic_summary_monthly (district);
