-- ============================================================================
-- SMART TRAFFIC IOC - Seed Data Initialization
-- Dữ liệu mẫu cho Dimension tables và mock data
-- ============================================================================

-- ============================================================================
-- SEED DIM_TIME - Tạo dữ liệu chiều thời gian cho 1 ngày (24 giờ)
-- ============================================================================

INSERT INTO dim_time (time_key, time_hour, time_minute, time_period) VALUES
-- Early morning (0-6h) - off peak
(202401010000, 0, 0, 'off_peak'),
(202401010030, 0, 30, 'off_peak'),
(202401010100, 1, 0, 'off_peak'),
(202401010130, 1, 30, 'off_peak'),
(202401010200, 2, 0, 'off_peak'),
(202401010230, 2, 30, 'off_peak'),
(202401010300, 3, 0, 'off_peak'),
(202401010330, 3, 30, 'off_peak'),
(202401010400, 4, 0, 'off_peak'),
(202401010430, 4, 30, 'off_peak'),
(202401010500, 5, 0, 'off_peak'),
(202401010530, 5, 30, 'off_peak'),
(202401010600, 6, 0, 'off_peak'),
(202401010630, 6, 30, 'off_peak'),

-- Morning peak (6-10h)
(202401010700, 7, 0, 'morning_peak'),
(202401010730, 7, 30, 'morning_peak'),
(202401010800, 8, 0, 'morning_peak'),
(202401010830, 8, 30, 'morning_peak'),
(202401010900, 9, 0, 'morning_peak'),
(202401010930, 9, 30, 'morning_peak'),
(202401011000, 10, 0, 'morning_peak'),
(202401011030, 10, 30, 'morning_peak'),

-- Mid-day (10-17h) - off peak
(202401011100, 11, 0, 'off_peak'),
(202401011130, 11, 30, 'off_peak'),
(202401011200, 12, 0, 'off_peak'),
(202401011230, 12, 30, 'off_peak'),
(202401011300, 13, 0, 'off_peak'),
(202401011330, 13, 30, 'off_peak'),
(202401011400, 14, 0, 'off_peak'),
(202401011430, 14, 30, 'off_peak'),
(202401011500, 15, 0, 'off_peak'),
(202401011530, 15, 30, 'off_peak'),
(202401011600, 16, 0, 'off_peak'),
(202401011630, 16, 30, 'off_peak'),

-- Evening peak (17-21h)
(202401011700, 17, 0, 'evening_peak'),
(202401011730, 17, 30, 'evening_peak'),
(202401011800, 18, 0, 'evening_peak'),
(202401011830, 18, 30, 'evening_peak'),
(202401011900, 19, 0, 'evening_peak'),
(202401011930, 19, 30, 'evening_peak'),
(202401012000, 20, 0, 'evening_peak'),
(202401012030, 20, 30, 'evening_peak'),

-- Late evening (21-24h) - off peak
(202401012100, 21, 0, 'off_peak'),
(202401012130, 21, 30, 'off_peak'),
(202401012200, 22, 0, 'off_peak'),
(202401012230, 22, 30, 'off_peak'),
(202401012300, 23, 0, 'off_peak'),
(202401012330, 23, 30, 'off_peak')
ON CONFLICT (time_key) DO NOTHING;

-- ============================================================================
-- SEED DIM_DATE - Tạo dữ liệu chiều ngày
-- ============================================================================

INSERT INTO dim_date (date_key, calendar_date, year, month, day, quarter, day_of_week, day_of_year, is_weekend, is_holiday) 
VALUES
(20240101, '2024-01-01', 2024, 1, 1, 1, 1, 1, FALSE, TRUE),   -- Tết Dương lịch
(20240102, '2024-01-02', 2024, 1, 2, 1, 2, 2, FALSE, FALSE),
(20240103, '2024-01-03', 2024, 1, 3, 1, 3, 3, FALSE, FALSE),
(20240104, '2024-01-04', 2024, 1, 4, 1, 4, 4, FALSE, FALSE),
(20240105, '2024-01-05', 2024, 1, 5, 1, 5, 5, FALSE, FALSE),
(20240106, '2024-01-06', 2024, 1, 6, 1, 6, 6, TRUE, FALSE),    -- Thứ 7
(20240107, '2024-01-07', 2024, 1, 7, 1, 7, 7, TRUE, FALSE)      -- Chủ nhật
ON CONFLICT (date_key) DO NOTHING;

-- ============================================================================
-- SEED DIM_SEGMENT - Tạo dữ liệu đoạn đường mẫu (TP.HCM)
-- ============================================================================

INSERT INTO dim_segment (segment_name, segment_code, from_location, to_location, length_km, num_lanes, speed_limit_kmh, geometry) 
VALUES
(
    'Đường Lê Lợi - Nguyễn Huệ',
    'SEG_001',
    'Bến Thành',
    'Lê Duẩn',
    2.5,
    4,
    40,
    ST_GeomFromText('LINESTRING(106.7033 10.7700, 106.7100 10.7750)', 4326)
),
(
    'Đường Võ Văn Kiệt',
    'SEG_002',
    'Cầu Sài Gòn',
    'Cảng Sài Gòn',
    8.0,
    3,
    50,
    ST_GeomFromText('LINESTRING(106.6950 10.7600, 106.6850 10.7400)', 4326)
),
(
    'Đường Cộng Hòa',
    'SEG_003',
    'Quận Tân Bình',
    'Quận Phú Nhuận',
    5.5,
    4,
    50,
    ST_GeomFromText('LINESTRING(106.6850 10.8100, 106.6900 10.8400)', 4326)
),
(
    'Đường Trần Hưng Đạo',
    'SEG_004',
    'Quận 1',
    'Quận 4',
    6.0,
    3,
    40,
    ST_GeomFromText('LINESTRING(106.7000 10.7600, 106.7050 10.7300)', 4326)
),
(
    'Đường Nguyễn Kiếm',
    'SEG_005',
    'Phú Nhuận',
    'Bình Thạnh',
    4.0,
    3,
    50,
    ST_GeomFromText('LINESTRING(106.7150 10.8200, 106.7200 10.8450)', 4326)
)
ON CONFLICT (segment_code) DO NOTHING;

-- ============================================================================
-- SEED DIM_SENSOR - Tạo dữ liệu đầu dò mẫu
-- ============================================================================

INSERT INTO dim_sensor (sensor_code, sensor_name, sensor_type, segment_id, latitude, longitude, geometry, is_active) 
SELECT 
    'SENSOR_' || LPAD(row_number()::TEXT, 3, '0'),
    'Camera ' || s.segment_code || ' - Sensor ' || row_number(),
    CASE WHEN row_number() % 3 = 0 THEN 'camera'
         WHEN row_number() % 3 = 1 THEN 'induction_loop'
         ELSE 'radar' END,
    s.segment_id,
    10.77 + (row_number() * 0.001),  -- Latitude (fake)
    106.70 + (row_number() * 0.002),  -- Longitude (fake)
    ST_MakePoint(106.70 + (row_number() * 0.002), 10.77 + (row_number() * 0.001)),
    TRUE
FROM dim_segment s
CROSS JOIN generate_series(1, 2) AS gs(row_number)
ON CONFLICT (sensor_code) DO NOTHING;

-- ============================================================================
-- SEED FACT_TRAFFIC_FLOW - Tạo dữ liệu luồng giao thông mẫu
-- ============================================================================

-- Nhập dữ liệu giả lập cho 5 ngày
INSERT INTO fact_traffic_flow (segment_id, time_key, date_key, sensor_id, vehicle_count, current_speed, avg_speed, max_speed, occupancy_rate, pcu_value, los_grade, los_score, data_quality_flag) 
SELECT 
    seg.segment_id,
    tm.time_key,
    CASE 
        WHEN tm.time_key BETWEEN 202401010000 AND 202401012330 THEN 20240101
        WHEN tm.time_key BETWEEN 202401020000 AND 202401022330 THEN 20240102
        WHEN tm.time_key BETWEEN 202401030000 AND 202401032330 THEN 20240103
        ELSE 20240104
    END as date_key,
    sen.sensor_id,
    -- vehicle_count: tăng vào giờ cao điểm
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 80 + RANDOM() * 40
        WHEN tm.time_period = 'evening_peak' THEN 100 + RANDOM() * 50
        ELSE 20 + RANDOM() * 20
    END::INT,
    -- current_speed: giảm vào giờ cao điểm
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 25 + RANDOM() * 10
        WHEN tm.time_period = 'evening_peak' THEN 20 + RANDOM() * 8
        ELSE 45 + RANDOM() * 15
    END::DECIMAL(8, 2),
    -- avg_speed
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 28 + RANDOM() * 12
        WHEN tm.time_period = 'evening_peak' THEN 22 + RANDOM() * 10
        ELSE 48 + RANDOM() * 10
    END::DECIMAL(8, 2),
    -- max_speed
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 50 + RANDOM() * 10
        WHEN tm.time_period = 'evening_peak' THEN 45 + RANDOM() * 10
        ELSE 60 + RANDOM() * 5
    END::DECIMAL(8, 2),
    -- occupancy_rate (%)
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 60 + RANDOM() * 30
        WHEN tm.time_period = 'evening_peak' THEN 70 + RANDOM() * 25
        ELSE 30 + RANDOM() * 20
    END::DECIMAL(5, 2),
    -- pcu_value
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 120 + RANDOM() * 60
        WHEN tm.time_period = 'evening_peak' THEN 150 + RANDOM() * 80
        ELSE 40 + RANDOM() * 30
    END::DECIMAL(10, 2),
    -- los_grade
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 'C'
        WHEN tm.time_period = 'evening_peak' THEN 'D'
        ELSE 'A'
    END,
    -- los_score (0-100)
    CASE 
        WHEN tm.time_period = 'morning_peak' THEN 60 + RANDOM() * 20
        WHEN tm.time_period = 'evening_peak' THEN 40 + RANDOM() * 25
        ELSE 80 + RANDOM() * 15
    END::INT,
    0  -- data_quality_flag (good)
FROM dim_segment seg
CROSS JOIN dim_time tm
CROSS JOIN (SELECT sensor_id FROM dim_sensor LIMIT 1) sen
WHERE tm.time_key BETWEEN 202401010000 AND 202401042330
ON CONFLICT DO NOTHING;

-- ============================================================================
-- REFRESH MATERIALIZED VIEWS
-- ============================================================================

REFRESH MATERIALIZED VIEW mv_hourly_speed_summary;

-- ============================================================================
-- VERIFICATION - Kiểm tra dữ liệu đã insert
-- ============================================================================

-- SELECT COUNT(*) as time_records FROM dim_time;
-- SELECT COUNT(*) as date_records FROM dim_date;
-- SELECT COUNT(*) as segment_records FROM dim_segment;
-- SELECT COUNT(*) as sensor_records FROM dim_sensor;
-- SELECT COUNT(*) as traffic_flow_records FROM fact_traffic_flow;
