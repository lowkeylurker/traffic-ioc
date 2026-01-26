-- ============================================================================
-- SMART TRAFFIC IOC - Database Schema Initialization
-- Tạo các bảng Fact và Dimension cho hệ thống giao thông
-- ============================================================================

-- Ensure PostGIS extension is enabled
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================================
-- DIMENSION TABLES (Bảng chiều)
-- ============================================================================

-- Bảng chiều thời gian (Dimension Time)
CREATE TABLE IF NOT EXISTS dim_time (
    time_key BIGINT PRIMARY KEY,
    -- Format: YYYYMMDDHHmm (e.g., 202310251030)
    time_hour SMALLINT,           -- 0-23
    time_minute SMALLINT,         -- 0-59
    time_period VARCHAR(20)       -- 'morning_peak', 'off_peak', 'evening_peak'
);

-- Bảng chiều ngày (Dimension Date)
CREATE TABLE IF NOT EXISTS dim_date (
    date_key INT PRIMARY KEY,
    -- Format: YYYYMMDD (e.g., 20231025)
    calendar_date DATE,
    year SMALLINT,
    month SMALLINT,
    day SMALLINT,
    quarter SMALLINT,
    day_of_week SMALLINT,         -- 1=Monday, 7=Sunday
    day_of_year SMALLINT,
    is_weekend BOOLEAN,
    is_holiday BOOLEAN
);

-- Bảng chiều đoạn đường (Dimension Segment)
CREATE TABLE IF NOT EXISTS dim_segment (
    segment_id SERIAL PRIMARY KEY,
    segment_name VARCHAR(255) NOT NULL,
    segment_code VARCHAR(50) UNIQUE,
    from_location VARCHAR(255),
    to_location VARCHAR(255),
    length_km DECIMAL(10, 2),     -- Độ dài đoạn (km)
    num_lanes SMALLINT,           -- Số làn đường
    speed_limit_kmh SMALLINT,     -- Giới hạn tốc độ (km/h)
    geometry GEOMETRY(LINESTRING, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index cho tìm kiếm không gian (Geographic query)
CREATE INDEX idx_dim_segment_geometry ON dim_segment USING GIST(geometry);

-- Bảng chiều đầu dò (Dimension Sensor)
CREATE TABLE IF NOT EXISTS dim_sensor (
    sensor_id SERIAL PRIMARY KEY,
    sensor_code VARCHAR(50) UNIQUE,
    sensor_name VARCHAR(255),
    sensor_type VARCHAR(50),      -- 'induction_loop', 'camera', 'radar'
    segment_id INT REFERENCES dim_segment(segment_id),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    geometry GEOMETRY(POINT, 4326),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dim_sensor_geometry ON dim_sensor USING GIST(geometry);

-- ============================================================================
-- FACT TABLES (Bảng sự kiện)
-- ============================================================================

-- Bảng sự kiện luồng giao thông (Fact Traffic Flow)
CREATE TABLE IF NOT EXISTS fact_traffic_flow (
    flow_id BIGSERIAL PRIMARY KEY,
    segment_id INT NOT NULL REFERENCES dim_segment(segment_id),
    time_key BIGINT NOT NULL REFERENCES dim_time(time_key),
    date_key INT NOT NULL REFERENCES dim_date(date_key),
    sensor_id INT REFERENCES dim_sensor(sensor_id),
    
    -- Thông tin giao thông
    vehicle_count INT,            -- Số lượng xe
    current_speed DECIMAL(8, 2),  -- Tốc độ hiện tại (km/h)
    avg_speed DECIMAL(8, 2),      -- Tốc độ trung bình (km/h)
    max_speed DECIMAL(8, 2),      -- Tốc độ tối đa
    occupancy_rate DECIMAL(5, 2), -- Tỷ lệ chiếm dụng (%)
    pcu_value DECIMAL(10, 2),     -- PCU (Passenger Car Unit)
    
    -- Chỉ số LOS (Level of Service)
    los_grade CHAR(1),            -- A, B, C, D, E, F
    los_score INT,                -- 0-100
    
    -- Metadata
    data_quality_flag SMALLINT,   -- 0: good, 1: warning, 2: error
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes cho truy vấn nhanh
CREATE INDEX idx_fact_traffic_flow_segment ON fact_traffic_flow(segment_id);
CREATE INDEX idx_fact_traffic_flow_time ON fact_traffic_flow(time_key);
CREATE INDEX idx_fact_traffic_flow_date ON fact_traffic_flow(date_key);
CREATE INDEX idx_fact_traffic_flow_segment_time ON fact_traffic_flow(segment_id, time_key);

-- Bảng sự kiện sự cố (Fact Incident)
CREATE TABLE IF NOT EXISTS fact_incident (
    incident_id BIGSERIAL PRIMARY KEY,
    segment_id INT NOT NULL REFERENCES dim_segment(segment_id),
    date_key INT NOT NULL REFERENCES dim_date(date_key),
    time_start BIGINT NOT NULL REFERENCES dim_time(time_key),
    time_end BIGINT REFERENCES dim_time(time_key),
    
    -- Thông tin sự cố
    incident_type VARCHAR(50),    -- 'accident', 'congestion', 'roadwork', 'weather'
    severity SMALLINT,            -- 1-5 (1=low, 5=critical)
    description TEXT,
    location_point GEOMETRY(POINT, 4326),
    
    -- Impact
    affected_lanes SMALLINT,
    estimated_delay_minutes INT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_incident_segment ON fact_incident(segment_id);
CREATE INDEX idx_fact_incident_geometry ON fact_incident USING GIST(location_point);

-- Bảng sự kiện dự báo (Fact Forecast)
CREATE TABLE IF NOT EXISTS fact_forecast (
    forecast_id BIGSERIAL PRIMARY KEY,
    segment_id INT NOT NULL REFERENCES dim_segment(segment_id),
    forecast_time BIGINT NOT NULL,  -- Thời gian dự báo (format: YYYYMMDDHHmm)
    forecast_horizon INT,           -- Tầm nhìn (phút)
    
    -- Dự báo
    predicted_speed DECIMAL(8, 2),
    predicted_vehicle_count INT,
    predicted_los_grade CHAR(1),
    confidence_score DECIMAL(5, 2), -- 0-100 (%)
    model_version VARCHAR(50),      -- Version của model
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fact_forecast_segment ON fact_forecast(segment_id);
CREATE INDEX idx_fact_forecast_time ON fact_forecast(forecast_time);

-- ============================================================================
-- MATERIALIZED VIEW - Aggregated Data for faster queries
-- ============================================================================

-- View tổng hợp tốc độ theo giờ
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_speed_summary AS
SELECT 
    segment_id,
    time_key,
    COUNT(*) as measurement_count,
    ROUND(AVG(current_speed)::NUMERIC, 2) as avg_speed,
    ROUND(MIN(current_speed)::NUMERIC, 2) as min_speed,
    ROUND(MAX(current_speed)::NUMERIC, 2) as max_speed,
    ROUND(AVG(occupancy_rate)::NUMERIC, 2) as avg_occupancy,
    MODE() WITHIN GROUP (ORDER BY los_grade) as dominant_los
FROM fact_traffic_flow
WHERE current_speed IS NOT NULL
GROUP BY segment_id, time_key;

CREATE INDEX idx_mv_hourly_speed_segment ON mv_hourly_speed_summary(segment_id);
CREATE INDEX idx_mv_hourly_speed_time ON mv_hourly_speed_summary(time_key);

-- ============================================================================
-- AUDIT & LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    operation VARCHAR(10),        -- 'INSERT', 'UPDATE', 'DELETE'
    record_id BIGINT,
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_time ON audit_log(changed_at);

-- ============================================================================
-- COMMENTS - Tài liệu hóa schema
-- ============================================================================

COMMENT ON TABLE dim_time IS 'Bảng chiều thời gian với định dạng key: YYYYMMDDHHmm';
COMMENT ON TABLE dim_date IS 'Bảng chiều ngày với định dạng key: YYYYMMDD';
COMMENT ON TABLE dim_segment IS 'Bảng chiều đoạn đường trên bản đồ (sử dụng PostGIS geometry)';
COMMENT ON TABLE dim_sensor IS 'Bảng chiều đầu dò giao thông';
COMMENT ON TABLE fact_traffic_flow IS 'Bảng sự kiện luồng giao thông (các phép đo từ cảm biến)';
COMMENT ON TABLE fact_incident IS 'Bảng sự kiện sự cố giao thông (tai nạn, tắc đường, etc.)';
COMMENT ON TABLE fact_forecast IS 'Bảng sự kiện dự báo giao thông (output của AI model)';

COMMENT ON COLUMN dim_segment.geometry IS 'LineString geometry của đoạn đường (WGS84/SRID 4326)';
COMMENT ON COLUMN dim_sensor.geometry IS 'Point geometry của vị trí đầu dò (WGS84/SRID 4326)';
COMMENT ON COLUMN fact_incident.location_point IS 'Point geometry của vị trí sự cố (WGS84/SRID 4326)';

-- ============================================================================
-- GRANT PERMISSIONS (for application user)
-- ============================================================================

-- Nếu cần, tạo user riêng cho application
-- CREATE USER traffic_app WITH PASSWORD 'app_password';
-- GRANT CONNECT ON DATABASE traffic_ioc_db TO traffic_app;
-- GRANT USAGE ON SCHEMA public TO traffic_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO traffic_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO traffic_app;
