-- ==============================================================================
-- FILE: 4_indexes.sql
-- DESCRIPTION: Chiến lược đánh chỉ mục chuyên sâu (Advanced Indexing Strategy)
-- PostgreSQL 15+ | PostGIS
-- Nguyên tắc: Dùng đúng loại Index cho đúng mục đích.
--   - BRIN  : Cột timestamp (dữ liệu ghi tuần tự theo thời gian)
--   - GiST  : Cột GEOMETRY (truy vấn không gian PostGIS)
--   - B-Tree: Khóa ngoại thường xuyên JOIN
--   - GIN   : Cột JSONB (nếu có trong tương lai)
-- ==============================================================================

-- ============================================================================
-- 1. BRIN INDEX – Cho các cột TIMESTAMP của bảng Fact
-- Dữ liệu IoT/Traffic ghi theo trình tự thời gian → BRIN lưu min/max per block
-- Dung lượng index giảm ~99% so với B-Tree, insert cực nhanh.
-- ============================================================================

-- fact_traffic_flow: cột timestamp & inserted_at
CREATE INDEX idx_fact_traffic_flow_ts_brin
    ON fact_traffic_flow USING BRIN (timestamp)
    WITH (pages_per_range = 32);

CREATE INDEX idx_fact_traffic_flow_inserted_brin
    ON fact_traffic_flow USING BRIN (inserted_at)
    WITH (pages_per_range = 64);

-- fact_incident: cột timestamp & inserted_at
CREATE INDEX idx_fact_incident_ts_brin
    ON fact_incident USING BRIN (timestamp)
    WITH (pages_per_range = 32);

CREATE INDEX idx_fact_incident_inserted_brin
    ON fact_incident USING BRIN (inserted_at)
    WITH (pages_per_range = 64);

-- fact_traffic_risk_prediction: cột timestamp & inserted_at
CREATE INDEX idx_fact_risk_pred_ts_brin
    ON fact_traffic_risk_prediction USING BRIN (timestamp)
    WITH (pages_per_range = 32);

CREATE INDEX idx_fact_risk_pred_inserted_brin
    ON fact_traffic_risk_prediction USING BRIN (inserted_at)
    WITH (pages_per_range = 64);

-- fact_event: cột inserted_at (bảng nhỏ nhưng vẫn dùng BRIN cho nhất quán)
CREATE INDEX idx_fact_event_inserted_brin
    ON fact_event USING BRIN (inserted_at)
    WITH (pages_per_range = 128);

-- fact_simulation_scenario: cột timestamp & inserted_at
CREATE INDEX idx_fact_sim_ts_brin
    ON fact_simulation_scenario USING BRIN (timestamp)
    WITH (pages_per_range = 64);

CREATE INDEX idx_fact_sim_inserted_brin
    ON fact_simulation_scenario USING BRIN (inserted_at)
    WITH (pages_per_range = 64);

-- fact_corridor_performance: cột timestamp & inserted_at
CREATE INDEX idx_fact_corridor_ts_brin
    ON fact_corridor_performance USING BRIN (timestamp)
    WITH (pages_per_range = 64);

CREATE INDEX idx_fact_corridor_inserted_brin
    ON fact_corridor_performance USING BRIN (inserted_at)
    WITH (pages_per_range = 64);

-- ============================================================================
-- 2. GiST INDEX – Cho các cột GEOMETRY (Bắt buộc cho PostGIS)
-- Nếu thiếu GiST, mọi truy vấn ST_DWithin / ST_Intersects sẽ
-- phải quét toàn bộ bảng (Sequential Scan) → sập DB.
-- ============================================================================

-- dim_node: tọa độ nút giao
CREATE INDEX idx_dim_node_geom_gist
    ON dim_node USING GIST (geometry);

-- dim_segment: tọa độ trung tâm đoạn đường
CREATE INDEX idx_dim_segment_center_gist
    ON dim_segment USING GIST (geometry_center);

-- dim_segment: hình dạng vector đoạn đường (LineString)
CREATE INDEX idx_dim_segment_linestring_gist
    ON dim_segment USING GIST (geometry_linestring);

-- fact_incident: tọa độ sự cố (Point)
CREATE INDEX idx_fact_incident_geom_gist
    ON fact_incident USING GIST (geometry);

-- ============================================================================
-- 3. B-Tree INDEX – Cho các khóa ngoại (FK) thường xuyên dùng JOIN
-- Tăng tốc các truy vấn WHERE / JOIN giữa Fact và Dim.
-- ============================================================================

-- === fact_traffic_flow ===
CREATE INDEX idx_fact_flow_segment
    ON fact_traffic_flow (segment_key);

CREATE INDEX idx_fact_flow_time
    ON fact_traffic_flow (time_key);

CREATE INDEX idx_fact_flow_date
    ON fact_traffic_flow (date_key);

CREATE INDEX idx_fact_flow_weather
    ON fact_traffic_flow (weather_key);

-- Composite index: segment + date (truy vấn phổ biến nhất: "tốc độ đoạn X ngày Y")
CREATE INDEX idx_fact_flow_segment_date
    ON fact_traffic_flow (segment_key, date_key);

-- === fact_incident ===
CREATE INDEX idx_fact_incident_segment
    ON fact_incident (segment_key);

CREATE INDEX idx_fact_incident_date
    ON fact_incident (date_key);

CREATE INDEX idx_fact_incident_location
    ON fact_incident (location_key);

-- Composite: segment + date (tìm sự cố trên đoạn đường theo ngày)
CREATE INDEX idx_fact_incident_segment_date
    ON fact_incident (segment_key, date_key);

-- Index cho cột is_active: hỗ trợ filter sự cố đang diễn ra
CREATE INDEX idx_fact_incident_active
    ON fact_incident (is_active)
    WHERE is_active = TRUE;

-- === fact_event ===
CREATE INDEX idx_fact_event_date
    ON fact_event (date_key);

CREATE INDEX idx_fact_event_location
    ON fact_event (location_key);

-- === fact_traffic_risk_prediction ===
CREATE INDEX idx_fact_risk_pred_segment
    ON fact_traffic_risk_prediction (segment_key);

CREATE INDEX idx_fact_risk_pred_date
    ON fact_traffic_risk_prediction (date_key);

-- Composite: segment + date (lấy dự báo rủi ro đoạn X ngày Y)
CREATE INDEX idx_fact_risk_pred_segment_date
    ON fact_traffic_risk_prediction (segment_key, date_key);

-- === fact_simulation_scenario ===
CREATE INDEX idx_fact_sim_segment
    ON fact_simulation_scenario (segment_key);

CREATE INDEX idx_fact_sim_date
    ON fact_simulation_scenario (date_key);

CREATE INDEX idx_fact_sim_scenario_id
    ON fact_simulation_scenario (scenario_id);

-- === fact_corridor_performance ===
CREATE INDEX idx_fact_corridor_perf_corridor
    ON fact_corridor_performance (corridor_key);

CREATE INDEX idx_fact_corridor_perf_date
    ON fact_corridor_performance (date_key);

CREATE INDEX idx_fact_corridor_perf_bottleneck
    ON fact_corridor_performance (bottleneck_seg_key);

-- ============================================================================
-- 4. B-Tree INDEX – Cho các Dimension (FK thường JOIN ngược)
-- ============================================================================

-- dim_date → dim_month_year
CREATE INDEX idx_dim_date_month_year
    ON dim_date (month_year_key);

-- dim_time_of_day → dim_shift
CREATE INDEX idx_dim_time_shift
    ON dim_time_of_day (default_shift_key);

-- dim_segment → dim_node, dim_way, dim_location
CREATE INDEX idx_dim_segment_from_node
    ON dim_segment (from_node_key);

CREATE INDEX idx_dim_segment_to_node
    ON dim_segment (to_node_key);

CREATE INDEX idx_dim_segment_way
    ON dim_segment (way_key);

CREATE INDEX idx_dim_segment_location
    ON dim_segment (location_key);

-- dim_way → dim_road
CREATE INDEX idx_dim_way_road
    ON dim_way (road_key);

-- bridge_corridor_segment: hỗ trợ lookup ngược từ segment → corridor
CREATE INDEX idx_bridge_corridor_seg_segment
    ON bridge_corridor_segment (segment_key);

-- ============================================================================
-- 5. PARTIAL INDEX & INDEX phụ trợ
-- ============================================================================

-- Index hỗ trợ filter nhanh congestion_level cao (mức 4–5 = tắc nghẽn nặng)
CREATE INDEX idx_fact_flow_high_congestion
    ON fact_traffic_flow (congestion_level, segment_key)
    WHERE congestion_level >= 4;

-- Index hỗ trợ filter LOS xấu (E, F)
CREATE INDEX idx_fact_flow_bad_los
    ON fact_traffic_flow (los_level, segment_key)
    WHERE los_level IN ('E', 'F');

-- Index hỗ trợ lọc sự cố nghiêm trọng (severity ≥ 4)
CREATE INDEX idx_fact_incident_severe
    ON fact_incident (severity_level, segment_key)
    WHERE severity_level >= 4;
