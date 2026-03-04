-- ==============================================================================
-- FILE: 2_create_dims.sql
-- DESCRIPTION: Khởi tạo các bảng Dimension (Chiều) – Galaxy Schema
-- PostgreSQL 15+ | PostGIS | KHÔNG sử dụng Partitioning
-- Lưu ý: PostgreSQL không có TINYINT, sử dụng SMALLINT thay thế.
-- ==============================================================================

-- ============================================================================
-- 1. NHÓM THỜI GIAN & LỊCH (Time & Calendar)
-- ============================================================================

-- Bảng phân cấp tháng/năm – phục vụ drill-down theo quý, năm
CREATE TABLE dim_month_year (
    month_year_key  INT         PRIMARY KEY,        -- YYYYMM (VD: 202401)
    month_number    SMALLINT    NOT NULL,            -- 1–12
    month_name_vi   VARCHAR(50),                     -- "Tháng 1", "Tháng 2"...
    month_start_date DATE,
    month_end_date  DATE,
    days_in_month   SMALLINT,
    quarter_number  SMALLINT    NOT NULL,            -- 1–4
    quarter_name    VARCHAR(50),                     -- "Quý 1"...
    year            SMALLINT    NOT NULL,
    days_in_year    SMALLINT,
    is_leap_year    BOOLEAN
);

-- Bảng chiều ngày – Smart Key dạng INT (YYYYMMDD)
CREATE TABLE dim_date (
    date_key        INT         PRIMARY KEY,        -- VD: 20240101
    month_year_key  INT         REFERENCES dim_month_year(month_year_key),
    full_date       DATE        NOT NULL,
    day_of_week     SMALLINT    NOT NULL,            -- 1(T2)–7(CN)
    day_name_vi     VARCHAR(20),                     -- "Thứ Hai"...
    iso_week        SMALLINT,
    is_weekend      BOOLEAN     DEFAULT FALSE,
    is_holiday      BOOLEAN     DEFAULT FALSE,
    is_end_of_month BOOLEAN     DEFAULT FALSE
);

-- Bảng ca làm việc – phục vụ phân tích theo ca trực
CREATE TABLE dim_shift (
    shift_key           INT         PRIMARY KEY,
    shift_code          VARCHAR(20),                -- VD: "NIGHT", "MORNING_PEAK"
    shift_name_vi       VARCHAR(50),                -- "Ban đêm", "Cao điểm sáng"
    start_hour          SMALLINT,                   -- Giờ bắt đầu (0–23)
    end_hour            SMALLINT,                   -- Giờ kết thúc (0–23)
    is_peak_hour        BOOLEAN     DEFAULT FALSE,  -- Cao điểm giao thông hay không
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng chiều thời gian trong ngày – Smart Key là phút (0–1439)
CREATE TABLE dim_time_of_day (
    time_key            INT         PRIMARY KEY,    -- 0–1439 (phút trong ngày)
    default_shift_key   INT         REFERENCES dim_shift(shift_key),
    hhmm                SMALLINT,                   -- HHMM (VD: 0730)
    bucket_5min_key     SMALLINT,                   -- Nhóm 5 phút
    bucket_15min_key    SMALLINT,                   -- Nhóm 15 phút
    bucket_60min_key    SMALLINT,                   -- Nhóm 60 phút
    is_business_hours   BOOLEAN     DEFAULT FALSE
);

-- Bảng danh mục ngày lễ
CREATE TABLE dim_holiday (
    holiday_key         INT         PRIMARY KEY,
    holiday_name_vi     VARCHAR(255),               -- "Tết Nguyên Đán"...
    duration_days       SMALLINT,
    is_public_holiday   BOOLEAN     DEFAULT FALSE,
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng cầu nối nhiều-nhiều: Ngày ↔ Ngày lễ
CREATE TABLE bridge_date_holiday (
    date_key    INT     REFERENCES dim_date(date_key),
    holiday_key INT     REFERENCES dim_holiday(holiday_key),
    PRIMARY KEY (date_key, holiday_key)
);

-- ============================================================================
-- 2. NHÓM BỐI CẢNH (Contextual)
-- ============================================================================

-- Bảng chiều thời tiết – severity_level dùng SMALLINT thay vì INT
CREATE TABLE dim_weather (
    weather_key         INT         PRIMARY KEY,
    weather_id          INT,                        -- ID từ API thời tiết
    name                VARCHAR(100) COLLATE "en_US.utf8",               -- Tên cụ thể của loại thời tiết (UTF-8)
    main_category       VARCHAR(50),                -- "Rain", "Clear", "Storm"
    severity_level      SMALLINT,                   -- Mức ảnh hưởng (0–5)
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 3. NHÓM HẠ TẦNG GIAO THÔNG (Road Infrastructure)
-- ============================================================================

-- Bảng chiều vị trí hành chính (Quận/Phường)
CREATE TABLE dim_location (
    location_key        BIGINT      PRIMARY KEY,
    ward                VARCHAR(100),               -- Phường
    district            VARCHAR(100),               -- Quận
    city                VARCHAR(100)    DEFAULT 'Hồ Chí Minh',
    geometry_polygon    GEOMETRY(Polygon, 4326),     -- Boundary polygon từ OSM
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng danh mục tên đường
CREATE TABLE dim_road (
    road_key            BIGINT      PRIMARY KEY,
    name                VARCHAR(100)    NOT NULL,
    total_length_m      DECIMAL(10,2),
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng thông số kỹ thuật tuyến đường (Way = nhóm các Segment)
-- tomtom_frc dùng SMALLINT (PostgreSQL không có TINYINT)
CREATE TABLE dim_way (
    way_key             BIGINT      PRIMARY KEY,
    road_key            BIGINT      REFERENCES dim_road(road_key),
    total_length_m      DECIMAL(10,2),
    direction           VARCHAR(20),                -- Forward / Backward / Both
    segment_count       INT,
    default_lane_count  SMALLINT,
    design_capacity     INT,
    default_speed_limit SMALLINT,                   -- km/h
    tomtom_frc          SMALLINT,                   -- Cấp đường TomTom (0–6)
    osm_highway_type    VARCHAR(30),                -- Phân loại OSM
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng điểm nút giao thông – cần PostGIS GEOMETRY(Point)
CREATE TABLE dim_node (
    node_key            BIGINT      PRIMARY KEY,
    node_source_id      BIGINT,                     -- OSM ID gốc
    is_snapped          BOOLEAN     DEFAULT FALSE,
    node_type           VARCHAR(30),                -- signalized / intersection / terminal
    geometry            GEOMETRY(Point, 4326),
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng phân đoạn đường chi tiết – đơn vị nhỏ nhất của hạ tầng
CREATE TABLE dim_segment (
    segment_key         BIGINT      PRIMARY KEY,
    from_node_key       BIGINT      REFERENCES dim_node(node_key),
    to_node_key         BIGINT      REFERENCES dim_node(node_key),
    way_key             BIGINT      REFERENCES dim_way(way_key),
    location_key        BIGINT      REFERENCES dim_location(location_key),
    segment_id_source   BIGINT,                     -- ID từ TomTom/OSM
    length_m            DECIMAL(10,2),
    geometry_center     GEOMETRY(Point, 4326),       -- Tọa độ trung tâm
    geometry_linestring GEOMETRY(LineString, 4326),   -- Hình dạng vector
    is_one_way          BOOLEAN     DEFAULT FALSE,
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 4. NHÓM QUẢN LÝ & HÀNH LANG (Management & Corridor)
-- ============================================================================

-- Bảng hành lang giao thông – phục vụ giám sát tuyến trọng điểm
CREATE TABLE dim_corridor (
    corridor_key        BIGINT      PRIMARY KEY,
    corridor_name       VARCHAR(255)    NOT NULL,
    importance_level    SMALLINT,                   -- Mức ưu tiên
    target_avg_speed    DECIMAL(5,2),               -- Vận tốc mục tiêu (km/h)
    total_length_m      DECIMAL(12,2),
    direction           VARCHAR(10),                -- NB / SB / EB / WB
    record_timestamp    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Bảng cầu nối nhiều-nhiều: Hành lang ↔ Đoạn đường (có thứ tự)
CREATE TABLE bridge_corridor_segment (
    corridor_key    BIGINT  REFERENCES dim_corridor(corridor_key),
    segment_key     BIGINT  REFERENCES dim_segment(segment_key),
    sequence_order  INT     NOT NULL,               -- Thứ tự đoạn trên hành lang
    PRIMARY KEY (corridor_key, segment_key)
);