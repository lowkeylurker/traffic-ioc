-- ==============================================================================
-- FILE: 3_create_facts.sql
-- DESCRIPTION: Khởi tạo Bảng Fact với chiến lược Declarative Table Partitioning
-- PostgreSQL 15+ | PostGIS | RANGE Partition theo date_key (tháng)
-- Lưu ý: Composite PK bắt buộc chứa Partition Key (date_key).
--         PostgreSQL không có TINYINT → dùng SMALLINT.
-- ==============================================================================

-- ============================================================================
-- 1. fact_traffic_flow – Dòng chảy giao thông (cập nhật 15p/lần)
-- Phân mảnh theo THÁNG vì dữ liệu tăng rất nhanh (~hàng triệu rows/tháng)
-- ============================================================================
CREATE TABLE fact_traffic_flow (
    traffic_flow_key    BIGINT          NOT NULL,
    segment_key         BIGINT          NOT NULL REFERENCES dim_segment(segment_key),
    time_key            INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key            INT             NOT NULL REFERENCES dim_date(date_key),
    weather_key         INT             REFERENCES dim_weather(weather_key),
    timestamp           TIMESTAMP       NOT NULL,
    pcu_volume          DECIMAL(10,2),              -- Lưu lượng xe quy đổi (PCU)
    traffic_index       DECIMAL(3,2),               -- Chỉ số giao thông (0.00–1.00)
    current_speed_kmh   DECIMAL(5,2),               -- Vận tốc thực tế
    free_flow_speed_kmh DECIMAL(5,2),               -- Vận tốc thông thoáng
    delay_seconds       INT,                        -- Độ trễ (giây)
    los_level           CHAR(1),                    -- Level of Service (A–F)
    congestion_level    SMALLINT,                   -- Mức tắc nghẽn (0–5)
    is_closed           BOOLEAN         DEFAULT FALSE,
    inserted_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag        SMALLINT        DEFAULT 1,  -- Cờ chất lượng
    -- Composite PK: bắt buộc chứa Partition Key (date_key)
    PRIMARY KEY (traffic_flow_key, date_key)
) PARTITION BY RANGE (date_key);

-- Tạo sẵn 12 phân mảnh cho năm 2024 (Tháng 01 → 12)
CREATE TABLE fact_traffic_flow_202401 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240101) TO (20240201);
CREATE TABLE fact_traffic_flow_202402 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240201) TO (20240301);
CREATE TABLE fact_traffic_flow_202403 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240301) TO (20240401);
CREATE TABLE fact_traffic_flow_202404 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240401) TO (20240501);
CREATE TABLE fact_traffic_flow_202405 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240501) TO (20240601);
CREATE TABLE fact_traffic_flow_202406 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240601) TO (20240701);
CREATE TABLE fact_traffic_flow_202407 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240701) TO (20240801);
CREATE TABLE fact_traffic_flow_202408 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240801) TO (20240901);
CREATE TABLE fact_traffic_flow_202409 PARTITION OF fact_traffic_flow FOR VALUES FROM (20240901) TO (20241001);
CREATE TABLE fact_traffic_flow_202410 PARTITION OF fact_traffic_flow FOR VALUES FROM (20241001) TO (20241101);
CREATE TABLE fact_traffic_flow_202411 PARTITION OF fact_traffic_flow FOR VALUES FROM (20241101) TO (20241201);
CREATE TABLE fact_traffic_flow_202412 PARTITION OF fact_traffic_flow FOR VALUES FROM (20241201) TO (20250101);

-- ============================================================================
-- 2. fact_incident – Sự cố giao thông
-- Phân mảnh theo THÁNG (dữ liệu ít hơn traffic_flow nhưng vẫn cần partition
-- để hỗ trợ DROP PARTITION khi purge dữ liệu cũ)
-- ============================================================================
CREATE TABLE fact_incident (
    incident_key    BIGINT          NOT NULL,
    time_key        INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key        INT             NOT NULL REFERENCES dim_date(date_key),
    segment_key     BIGINT          NOT NULL REFERENCES dim_segment(segment_key),
    location_key    BIGINT          REFERENCES dim_location(location_key),
    incident_type   VARCHAR(50),                    -- Loại: accident, flood, roadwork...
    timestamp       TIMESTAMP       NOT NULL,
    severity_level  SMALLINT,                       -- Mức độ (1–5)
    delay_seconds   INT,
    geometry        GEOMETRY(Point, 4326),           -- Tọa độ sự cố
    is_simulated    BOOLEAN         DEFAULT FALSE,
    is_active       BOOLEAN         DEFAULT TRUE,
    inserted_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag    SMALLINT        DEFAULT 1,
    PRIMARY KEY (incident_key, date_key)
) PARTITION BY RANGE (date_key);

-- 12 phân mảnh cho năm 2024
CREATE TABLE fact_incident_202401 PARTITION OF fact_incident FOR VALUES FROM (20240101) TO (20240201);
CREATE TABLE fact_incident_202402 PARTITION OF fact_incident FOR VALUES FROM (20240201) TO (20240301);
CREATE TABLE fact_incident_202403 PARTITION OF fact_incident FOR VALUES FROM (20240301) TO (20240401);
CREATE TABLE fact_incident_202404 PARTITION OF fact_incident FOR VALUES FROM (20240401) TO (20240501);
CREATE TABLE fact_incident_202405 PARTITION OF fact_incident FOR VALUES FROM (20240501) TO (20240601);
CREATE TABLE fact_incident_202406 PARTITION OF fact_incident FOR VALUES FROM (20240601) TO (20240701);
CREATE TABLE fact_incident_202407 PARTITION OF fact_incident FOR VALUES FROM (20240701) TO (20240801);
CREATE TABLE fact_incident_202408 PARTITION OF fact_incident FOR VALUES FROM (20240801) TO (20240901);
CREATE TABLE fact_incident_202409 PARTITION OF fact_incident FOR VALUES FROM (20240901) TO (20241001);
CREATE TABLE fact_incident_202410 PARTITION OF fact_incident FOR VALUES FROM (20241001) TO (20241101);
CREATE TABLE fact_incident_202411 PARTITION OF fact_incident FOR VALUES FROM (20241101) TO (20241201);
CREATE TABLE fact_incident_202412 PARTITION OF fact_incident FOR VALUES FROM (20241201) TO (20250101);

-- ============================================================================
-- 3. fact_event – Sự kiện xã hội (KHÔNG phân mảnh – dữ liệu ít)
-- ============================================================================
CREATE TABLE fact_event (
    event_id        BIGINT          PRIMARY KEY,
    start_time_key  INT             REFERENCES dim_time_of_day(time_key),
    end_time_key    INT             REFERENCES dim_time_of_day(time_key),
    date_key        INT             NOT NULL REFERENCES dim_date(date_key),
    location_key    BIGINT          REFERENCES dim_location(location_key),
    event_type      VARCHAR(50),                    -- concert, sport, festival...
    attendance_scale INT,                           -- Quy mô (số người)
    impact_radius_m INT,                            -- Bán kính ảnh hưởng (mét)
    event_title     VARCHAR(255),
    inserted_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag    SMALLINT        DEFAULT 1
);

-- ============================================================================
-- 4. fact_traffic_risk_prediction – Dự báo rủi ro giao thông
-- Phân mảnh theo THÁNG (mô hình AI chạy liên tục → dữ liệu tăng nhanh)
-- ============================================================================
CREATE TABLE fact_traffic_risk_prediction (
    prediction_key      BIGINT          NOT NULL,
    segment_key         BIGINT          NOT NULL REFERENCES dim_segment(segment_key),
    time_key            INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key            INT             NOT NULL REFERENCES dim_date(date_key),
    timestamp           TIMESTAMP       NOT NULL,
    horizon_minutes     INT,                        -- Phạm vi dự báo (phút)
    predicted_risk_score DECIMAL(3,2),              -- Điểm rủi ro (0.00–1.00)
    confidence_level    DECIMAL(3,2),               -- Độ tin cậy (0.00–1.00)
    model_version       VARCHAR(20),
    inserted_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag        SMALLINT        DEFAULT 1,
    PRIMARY KEY (prediction_key, date_key)
) PARTITION BY RANGE (date_key);

-- 12 phân mảnh cho năm 2024
CREATE TABLE fact_risk_pred_202401 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240101) TO (20240201);
CREATE TABLE fact_risk_pred_202402 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240201) TO (20240301);
CREATE TABLE fact_risk_pred_202403 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240301) TO (20240401);
CREATE TABLE fact_risk_pred_202404 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240401) TO (20240501);
CREATE TABLE fact_risk_pred_202405 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240501) TO (20240601);
CREATE TABLE fact_risk_pred_202406 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240601) TO (20240701);
CREATE TABLE fact_risk_pred_202407 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240701) TO (20240801);
CREATE TABLE fact_risk_pred_202408 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240801) TO (20240901);
CREATE TABLE fact_risk_pred_202409 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20240901) TO (20241001);
CREATE TABLE fact_risk_pred_202410 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20241001) TO (20241101);
CREATE TABLE fact_risk_pred_202411 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20241101) TO (20241201);
CREATE TABLE fact_risk_pred_202412 PARTITION OF fact_traffic_risk_prediction FOR VALUES FROM (20241201) TO (20250101);

-- ============================================================================
-- 5. fact_simulation_scenario – Kịch bản giả lập CityFlow (KHÔNG phân mảnh)
-- ============================================================================
CREATE TABLE fact_simulation_scenario (
    simulation_key  BIGINT          PRIMARY KEY,
    time_key        INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key        INT             NOT NULL REFERENCES dim_date(date_key),
    segment_key     BIGINT          NOT NULL REFERENCES dim_segment(segment_key),
    incident_key    BIGINT,                         -- Không FK cứng vào partitioned table
    scenario_id     VARCHAR(50),                    -- Mã kịch bản
    timestamp       TIMESTAMP       NOT NULL,
    sim_avg_speed   DECIMAL(5,2),                   -- Vận tốc mô phỏng (km/h)
    sim_travel_time INT,                            -- Thời gian đi (giây)
    improvement_pct DECIMAL(5,2),                   -- % cải thiện so với baseline
    is_optimal_plan BOOLEAN         DEFAULT FALSE,
    inserted_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag    SMALLINT        DEFAULT 1
);

-- ============================================================================
-- 6. fact_corridor_performance – Hiệu suất hành lang giao thông (KHÔNG phân mảnh)
-- ============================================================================
CREATE TABLE fact_corridor_performance (
    corridor_perf_key       BIGINT          PRIMARY KEY,
    corridor_key            BIGINT          NOT NULL REFERENCES dim_corridor(corridor_key),
    time_key                INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key                INT             NOT NULL REFERENCES dim_date(date_key),
    bottleneck_seg_key      BIGINT          REFERENCES dim_segment(segment_key),
    timestamp               TIMESTAMP       NOT NULL,
    avg_corridor_speed      DECIMAL(5,2),           -- Vận tốc TB hành lang (km/h)
    total_delay_seconds     INT,                    -- Tổng trễ (giây)
    travel_time_index       DECIMAL(4,2),           -- TTI (Travel Time Index)
    corridor_efficiency     DECIMAL(3,2),           -- Hiệu quả (0.00–1.00)
    active_incident_count   INT,                    -- Số sự cố đang xảy ra
    inserted_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quality_flag            SMALLINT        DEFAULT 1
);