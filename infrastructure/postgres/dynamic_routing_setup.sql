-- Active: 1774753654557@@psql-smart-traffic-dev.postgres.database.azure.com@5432@traffic_ioc_db
-- ==========================================
-- SCRIPT: Tiền xử lý Data Warehouse DW cho chức năng Dynamic Routing
-- PURPOSE: Tạo cấu trúc Topology cho hệ thống dẫn đường với pgRouting
-- ==========================================

-- 0. Đảm bảo PostGIS và pgRouting đã được bật trên DB
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- 1. Tạo bảng Routing Edges từ dim_segment 
-- Mục đích: Tách biệt tính năng tìm đường với bảng Dimension tĩnh, bảo toàn Data Lineage
DROP TABLE IF EXISTS routing_edges CASCADE;

CREATE TABLE routing_edges AS
SELECT 
    s.segment_key AS id,
    s.from_node_key AS source,
    s.to_node_key AS target,
    s.length_m AS distance_m,
    s.is_one_way,
    COALESCE(NULLIF(w.default_speed_limit, 0), 40)::FLOAT8 AS free_flow_speed_kmh,
    s.geometry_linestring AS geom_way,
    ST_Centroid(s.geometry_linestring) as geom_centroid -- Add centroid column directly
FROM dim_segment s
LEFT JOIN dim_way w ON s.way_key = w.way_key
WHERE s.geometry_linestring IS NOT NULL;

-- 2. Thêm Primary Key và Spatial Index
ALTER TABLE routing_edges ADD PRIMARY KEY (id);
CREATE INDEX idx_routing_edges_geom ON routing_edges USING GIST(geom_way);
CREATE INDEX idx_routing_edges_centroid ON routing_edges USING GIST(geom_centroid); -- CRITICAL: Index on Point for KNN
CREATE INDEX idx_routing_edges_source ON routing_edges (source);
CREATE INDEX idx_routing_edges_target ON routing_edges (target);

-- 3. Tạo mạng lưới Topology
SELECT pgr_createTopology(
    'routing_edges',      -- Bảng cạnh
    0.00001,              -- Độ sai số tọa độ
    'geom_way',           -- Tên cột Geometry
    'id',                 -- Tên Khóa chính
    'source',             -- Nút đầu
    'target',             -- Nút cuối
    'true',               -- Lọc rows_where mặc định
    true                  -- Bật clean dữ liệu chồng chéo
);

-- 4. Tạo bảng tham chiếu hàng xóm (Proximity Lookup Table)
-- Mục đích: Tính toán sẵn 10 hàng xóm gần nhất cho từng đoạn đường để tránh tính toán hình học lúc tạo View
CREATE TABLE IF NOT EXISTS dim_segment_traffic_proximity (
    segment_key BIGINT,
    neighbor_segment_key BIGINT,
    distance FLOAT8,
    rank INT,
    PRIMARY KEY (segment_key, neighbor_segment_key)
);

CREATE INDEX IF NOT EXISTS idx_segment_traffic_proximity_neighbor ON dim_segment_traffic_proximity (neighbor_segment_key);

-- Tính toán dữ liệu hàng xóm (Chỉ chạy một lần, có thể mất vài phút cho 430k dòng)
INSERT INTO dim_segment_traffic_proximity (segment_key, neighbor_segment_key, distance, rank)
SELECT 
    sub.id,
    sub.neighbor_id,
    sub.distance,
    sub.rank
FROM (
    SELECT 
        r1.id,
        r2.id as neighbor_id,
        ST_Distance(r1.geom_centroid, r2.geom_centroid) as distance,
        ROW_NUMBER() OVER(PARTITION BY r1.id ORDER BY r1.geom_centroid <-> r2.geom_centroid) as rank
    FROM routing_edges r1
    CROSS JOIN LATERAL (
        -- Tìm top 10 hàng xóm có khả năng có dữ liệu traffic (các đường trục chính)
        -- Sử dụng toán tử <-> trên cột đã index để đạt tốc độ KNN thực sự
        SELECT r2.id, r2.geom_centroid
        FROM routing_edges r2
        JOIN dim_segment s2 ON r2.id = s2.segment_key
        JOIN dim_way w2 ON s2.way_key = w2.way_key
        WHERE w2.osm_highway_type IN ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link')
          AND r1.id != r2.id
        ORDER BY r1.geom_centroid <-> r2.geom_centroid
        LIMIT 10
    ) r2
) sub
ON CONFLICT DO NOTHING;

-- 5. Xây dựng Materialized View với cơ chế bù đắp dữ liệu nâng cao (Confidence Decay & IDW Imputation)
-- Mục đích: Đảm bảo tính liên tục của dữ liệu ngay cả khi hệ thống cảm biến bị mất tín hiệu

DROP VIEW IF EXISTS view_dynamic_routing_edges CASCADE;
DROP MATERIALIZED VIEW IF EXISTS view_dynamic_routing_edges CASCADE;

CREATE MATERIALIZED VIEW view_dynamic_routing_edges AS
WITH 
traffic_with_confidence AS (
    SELECT DISTINCT ON (segment_key)
        segment_key,
        current_speed_kmh,
        free_flow_speed_kmh,
        inserted_at AS timestamp,
        -- C = e^(-lambda * dt) | lambda = 0.046 (Độ tin cậy giảm 50% sau 15p)
        EXP(-0.046 * (EXTRACT(EPOCH FROM (NOW() - inserted_at)) / 60.0)) as confidence,
        -- Vận tốc thực tế sau khi xử lý độ tin cậy (Decay)
        -- Càng lâu không có dữ liệu, vận tốc càng tiến dần về Free-flow
        -- Giới hạn vận tốc tối thiểu 5km/h để tránh thời gian di chuyển vô tận
        GREATEST(5.0, (COALESCE(free_flow_speed_kmh, 40) + (current_speed_kmh - COALESCE(free_flow_speed_kmh, 40)) * EXP(-0.046 * (EXTRACT(EPOCH FROM (NOW() - inserted_at)) / 60.0)))) as adjusted_speed
    FROM fact_traffic_flow
    WHERE inserted_at >= NOW() - INTERVAL '2 hours' 
    ORDER BY segment_key, inserted_at DESC
),
decay_traffic AS (
    SELECT 
        twc.segment_key,
        twc.adjusted_speed,
        ST_Centroid(r.geom_way) as geom_centroid -- USE CENTROID for Point-to-Point math
    FROM traffic_with_confidence twc
    JOIN routing_edges r ON twc.segment_key = r.id
),
dark_segments AS (
    SELECT 
        r.id, 
        COALESCE(NULLIF(w.default_speed_limit, 0), 40)::FLOAT8 as free_flow_speed_kmh,
        ST_Centroid(r.geom_way) as geom_centroid 
    FROM routing_edges r
    JOIN dim_segment s ON r.id = s.segment_key
    LEFT JOIN dim_way w ON s.way_key = w.way_key
    LEFT JOIN decay_traffic dt ON r.id = dt.segment_key
    WHERE dt.segment_key IS NULL
      AND (w.osm_highway_type IS NOT NULL) -- Chỉ suy luận cho các đường chính
),
idw_imputed AS (
    SELECT 
        segment_key,
        -- IDW: Suy luận vận tốc từ các hàng xóm
        (SUM(adjusted_speed / d2) / SUM(1.0 / d2)) as imputed_speed
    FROM (
        SELECT 
            ds.id as segment_key,
            dt.adjusted_speed,
            NULLIF(POWER(prox.distance, 2), 0) as d2,
            ROW_NUMBER() OVER(PARTITION BY ds.id ORDER BY prox.distance) as rank
        FROM dark_segments ds
        JOIN dim_segment_traffic_proximity prox ON ds.id = prox.segment_key
        JOIN decay_traffic dt ON prox.neighbor_segment_key = dt.segment_key
    ) neighbors_with_traffic
    WHERE rank <= 3
    GROUP BY segment_key
)
-- BƯỚC 4: Tổng hợp Chi phí cuối cùng (Final Cost)
-- Thứ tự ưu tiên Tốc độ cơ sở: Live Free-flow > Default Speed Limit > 40km/h
-- Thứ tự ưu tiên Lưu thông: Live TTI (có decay) > Suỹ luận IDW > Thông thoáng (1.0)
SELECT 
    r.id,
    r.source,
    r.target,
    -- Tính vận tốc cuối cùng (km/h)
    COALESCE(dt.adjusted_speed, it.imputed_speed, r.free_flow_speed_kmh) as current_speed,
    -- travel_time (seconds) = distance / (speed / 3.6)
    (r.distance_m / (GREATEST(5.0, COALESCE(dt.adjusted_speed, it.imputed_speed, r.free_flow_speed_kmh)) / 3.6))::FLOAT8 AS travel_time,
    r.distance_m::FLOAT8 AS travel_distance,
    -- BƯỚC 4: Tổng hợp Chi phí cuối cùng (Final Cost)
    -- Alpha = 0.02 (1km detour = 20s penalty)
    (
      (r.distance_m / (GREATEST(5.0, COALESCE(dt.adjusted_speed, it.imputed_speed, r.free_flow_speed_kmh)) / 3.6))
      + (0.02 * r.distance_m)
    ) * (CASE 
            WHEN dt.segment_key IS NOT NULL THEN 1.0 
            WHEN it.segment_key IS NOT NULL THEN 1.05 
            ELSE 1.1 
         END)::FLOAT8 AS cost,
    CASE 
        WHEN r.is_one_way THEN -1.0::FLOAT8
        ELSE (
          (r.distance_m / (GREATEST(5.0, COALESCE(dt.adjusted_speed, it.imputed_speed, r.free_flow_speed_kmh)) / 3.6))
          + (0.02 * r.distance_m)
        ) * (CASE 
                WHEN dt.segment_key IS NOT NULL THEN 1.0 
                WHEN it.segment_key IS NOT NULL THEN 1.05 
                ELSE 1.1 
             END)::FLOAT8
    END AS reverse_cost,
    r.geom_way AS geom,
    ST_X(ST_StartPoint(r.geom_way)) as x1,
    ST_Y(ST_StartPoint(r.geom_way)) as y1,
    ST_X(ST_EndPoint(r.geom_way)) as x2,
    ST_Y(ST_EndPoint(r.geom_way)) as y2,
    CASE 
        WHEN dt.segment_key IS NOT NULL THEN 'live_decay'
        WHEN it.segment_key IS NOT NULL THEN 'imputed_spatial'
        ELSE 'default_fallback'
    END as cost_source
FROM routing_edges r
LEFT JOIN dim_segment s ON r.id = s.segment_key
LEFT JOIN dim_way w ON s.way_key = w.way_key
LEFT JOIN decay_traffic dt ON r.id = dt.segment_key
LEFT JOIN idw_imputed it ON r.id = it.segment_key;

-- 5. Index & Ví dụ sử dụng
CREATE UNIQUE INDEX idx_view_dynamic_routing_edges_id ON view_dynamic_routing_edges (id);

/*
    HƯỚNG DẪN:
    1. REFRESH MATERIALIZED VIEW CONCURRENTLY view_dynamic_routing_edges;
    2. pgr_dijkstra dùng bình thường với view này.
*/

REFRESH MATERIALIZED VIEW CONCURRENTLY view_dynamic_routing_edges;
