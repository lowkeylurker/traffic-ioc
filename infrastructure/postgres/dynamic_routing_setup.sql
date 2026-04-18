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
    segment_key AS id,
    from_node_key AS source,
    to_node_key AS target,
    length_m AS distance_m,
    is_one_way,
    geometry_linestring AS geom_way
FROM dim_segment
WHERE geometry_linestring IS NOT NULL;

-- 2. Thêm Primary Key và Spatial Index cho việc tối ưu hiệu suất truy vấn GIS
ALTER TABLE routing_edges ADD PRIMARY KEY (id);
CREATE INDEX idx_routing_edges_geom ON routing_edges USING GIST(geom_way);
CREATE INDEX idx_routing_edges_source ON routing_edges (source);
CREATE INDEX idx_routing_edges_target ON routing_edges (target);

-- 3. Tạo mạng lưới Topology với độ chính xác cao (Tolerance)
-- pgRouting sẽ tự động quét chéo các line, vá đứt gãy nếu lệch tọa độ dưới ngưỡng cho phép (~1m)
SELECT pgr_createTopology(
    'routing_edges',      -- Bảng cạnh
    0.00001,              -- Độ sai số tọa độ
    'geom_way',           -- Tên cột Geometry
    'id',                 -- Tên Khóa chính
    'source',             -- Nút đầu
    'target',             -- Nút cuối
    clean := true         -- Bật clean dữ liệu chồng chéo
);

-- 4. Xây dựng View kết hợp Topology tĩnh & Dữ liệu giao thông theo thời gian thực (Data Fusion)
-- COST: Tiêu chí tìm đường là "TỔNG THỜI GIAN NGẮN NHẤT"
-- Công thức: Độ_Dài(m) / Vận_tốc(m/s). (Tốc độ km/h quy đổi qua m/s = kmh * 1000 / 3600)
-- Nếu đường mất tín hiệu (null), dùng mặc định tốc độ free_flow hoặc 40km/h

-- REVERSE_COST: Tiêu chí chống đi ngược vào đường 1 chiều
-- Phạt nặng hệ số -1 nếu là đường 1 chiều (is_one_way = true)
CREATE OR REPLACE VIEW view_dynamic_routing_edges AS
WITH latest_traffic AS (
    -- Dùng DISTINCT ON để chỉ rút ra bản ghi mới nhất của mỗi đoạn đường
    SELECT DISTINCT ON (segment_key) 
        segment_key, 
        current_speed_kmh, 
        free_flow_speed_kmh
    FROM fact_traffic_flow
    WHERE timestamp >= NOW() - INTERVAL '15 minutes'
    ORDER BY segment_key, timestamp DESC
)
SELECT 
    r.id,
    r.source,
    r.target,
    (r.distance_m / 
      NULLIF(COALESCE(t.current_speed_kmh, t.free_flow_speed_kmh, 40) * 1000.0 / 3600.0, 0)
    )::FLOAT8 AS cost,
    CASE 
        WHEN r.is_one_way THEN -1.0::FLOAT8
        ELSE (r.distance_m / 
               NULLIF(COALESCE(t.current_speed_kmh, t.free_flow_speed_kmh, 40) * 1000.0 / 3600.0, 0)
             )::FLOAT8
    END AS reverse_cost,
    r.geom_way AS geom
FROM routing_edges r
LEFT JOIN latest_traffic t ON r.id = t.segment_key;

-- 5. Ví dụ Hướng dẫn thực thi hàm Dynamic Routing từ code Backend
/*
    SELECT 
        seq, path_seq, node, edge, 
        cost AS travel_time_seconds, 
        agg_cost AS cumulative_time
    FROM pgr_dijkstra(
        'SELECT id, source, target, cost, reverse_cost FROM view_dynamic_routing_edges',
        <START_NODE_ID>, 
        <END_NODE_ID>, 
        directed := true
    );
*/
