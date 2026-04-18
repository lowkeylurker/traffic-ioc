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
    COALESCE(w.default_speed_limit, 40)::FLOAT8 AS free_flow_speed_kmh,
    s.geometry_linestring AS geom_way
FROM dim_segment s
LEFT JOIN dim_way w ON s.way_key = w.way_key
WHERE s.geometry_linestring IS NOT NULL;

-- 2. Thêm Primary Key và Spatial Index
ALTER TABLE routing_edges ADD PRIMARY KEY (id);
CREATE INDEX idx_routing_edges_geom ON routing_edges USING GIST(geom_way);
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
    clean := true         -- Bật clean dữ liệu chồng chéo
);

-- 4. Xây dựng Materialized View với cơ chế bù đắp dữ liệu nâng cao (Confidence Decay & IDW Imputation)
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
        timestamp,
        -- C = e^(-lambda * dt) | lambda = 0.046 (Độ tin cậy giảm 50% sau 15p)
        EXP(-0.046 * (EXTRACT(EPOCH FROM (NOW() - timestamp)) / 60.0)) as confidence,
        -- TTI = Vận tốc tự do / Vận tốc thực tế (TTI càng cao -> kẹt xe càng nặng)
        GREATEST(1.0, (COALESCE(free_flow_speed_kmh, 40) / NULLIF(current_speed_kmh, 0))) as tti
    FROM fact_traffic_flow
    WHERE timestamp >= NOW() - INTERVAL '2 hours' 
    ORDER BY segment_key, timestamp DESC
),

decay_traffic AS (
    SELECT 
        segment_key,
        tti,
        confidence,
        -- TTI_adj = 1.0 + (tti - 1.0) * confidence
        -- Data càng cũ -> TTI tiến về 1.0 (coi như đường thông thoáng trở lại)
        (1.0 + (tti - 1.0) * confidence) as adjusted_tti
    FROM traffic_with_confidence
),
dark_segments AS (
    SELECT id, geom_way
    FROM routing_edges
    WHERE id NOT IN (SELECT segment_key FROM decay_traffic)
),
idw_imputed AS (
    SELECT 
        ds.id as segment_key,
        -- IDW: Sum(TTI_i / d_i^2) / Sum(1 / d_i^2) | Với p=2
        (SUM(neighbors.adjusted_tti / NULLIF(POWER(ST_Distance(ds.geom_way, neighbors.geom_way), 2), 0)) / 
         SUM(1.0 / NULLIF(POWER(ST_Distance(ds.geom_way, neighbors.geom_way), 2), 0))
        ) as imputed_tti
    FROM dark_segments ds
    CROSS JOIN LATERAL (
        -- Lấy Top 3 hàng xóm gần nhất có dữ liệu gần đây
        SELECT re.geom_way, dt.adjusted_tti
        FROM routing_edges re
        JOIN decay_traffic dt ON re.id = dt.segment_key
        ORDER BY ds.geom_way <-> re.geom_way
        LIMIT 3
    ) neighbors
    GROUP BY ds.id
)
-- BƯỚC 4: Tổng hợp Chi phí cuối cùng (Final Cost)
-- Thứ tự ưu tiên Tốc độ cơ sở: Live Free-flow > Default Speed Limit > 40km/h
-- Thứ tự ưu tiên Lưu thông: Live TTI (có decay) > Suỹ luận IDW > Thông thoáng (1.0)
SELECT 
    r.id,
    r.source,
    r.target,
    (r.distance_m / 
      ( (COALESCE(dt.free_flow_speed_kmh, w.default_speed_limit, 40) / COALESCE(dt.adjusted_tti, it.imputed_tti, 1.0)) * 1000.0 / 3600.0 )
    )::FLOAT8 AS cost,
    CASE 
        WHEN r.is_one_way THEN -1.0::FLOAT8
        ELSE (r.distance_m / 
               ( (COALESCE(dt.free_flow_speed_kmh, w.default_speed_limit, 40) / COALESCE(dt.adjusted_tti, it.imputed_tti, 1.0)) * 1000.0 / 3600.0 )
             )::FLOAT8
    END AS reverse_cost,
    r.geom_way AS geom,
    -- Metadata để phục vụ giám sát độ chính xác
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
