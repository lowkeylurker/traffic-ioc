-- ==============================================================================
-- FILE: 5_seed_dim_weather.sql
-- DESCRIPTION: Seed data cho dim_weather - Các mã thời tiết đặc thù TP.HCM
-- OpenWeatherMap Weather Condition IDs
-- ==============================================================================

-- Insert seed data cho dim_weather
-- Sử dụng UPSERT để có thể chạy script nhiều lần mà không bị lỗi duplicate key

INSERT INTO dim_weather (weather_key, weather_id, name, main_category, severity_level, record_timestamp)
VALUES
    -- Mức 4 (Dông bão - Nguy hiểm)
    (200, 200, 'Dông có mưa nhẹ', 'Thunderstorm', 4, CURRENT_TIMESTAMP),
    (201, 201, 'Dông có mưa', 'Thunderstorm', 4, CURRENT_TIMESTAMP),
    (202, 202, 'Dông có mưa to', 'Thunderstorm', 4, CURRENT_TIMESTAMP),
    (211, 211, 'Dông', 'Thunderstorm', 4, CURRENT_TIMESTAMP),
    (212, 212, 'Dông dữ dội', 'Thunderstorm', 4, CURRENT_TIMESTAMP),
    
    -- Mức 2 (Mưa phùn - Ảnh hưởng vừa)
    (300, 300, 'Mưa phùn nhẹ', 'Drizzle', 2, CURRENT_TIMESTAMP),
    (301, 301, 'Mưa phùn', 'Drizzle', 2, CURRENT_TIMESTAMP),
    (310, 310, 'Mưa phùn nhẹ', 'Drizzle', 2, CURRENT_TIMESTAMP),
    
    -- Mức 3 (Mưa rào - Ảnh hưởng lớn)
    (500, 500, 'Mưa nhẹ', 'Rain', 3, CURRENT_TIMESTAMP),
    (501, 501, 'Mưa vừa', 'Rain', 3, CURRENT_TIMESTAMP),
    (502, 502, 'Mưa to', 'Rain', 3, CURRENT_TIMESTAMP),
    (503, 503, 'Mưa rất to', 'Rain', 3, CURRENT_TIMESTAMP),
    (504, 504, 'Mưa cực to', 'Rain', 3, CURRENT_TIMESTAMP),
    (521, 521, 'Mưa rào', 'Rain', 3, CURRENT_TIMESTAMP),
    
    -- Mức 1 (Sương mú/Khói - Ảnh hưởng tầm nhìn)
    (701, 701, 'Sương mù', 'Mist', 1, CURRENT_TIMESTAMP),
    (721, 721, 'Sương khói', 'Haze', 1, CURRENT_TIMESTAMP),
    (741, 741, 'Sương mù dày', 'Fog', 1, CURRENT_TIMESTAMP),
    
    -- Mức 0 (Trời quang/Có mây - Không ảnh hưởng)
    (800, 800, 'Trời quang', 'Clear', 0, CURRENT_TIMESTAMP),
    (801, 801, 'Ít mây', 'Clouds', 0, CURRENT_TIMESTAMP),
    (802, 802, 'Có mây', 'Clouds', 0, CURRENT_TIMESTAMP),
    (803, 803, 'Nhiều mây', 'Clouds', 0, CURRENT_TIMESTAMP),
    (804, 804, 'U ám', 'Clouds', 0, CURRENT_TIMESTAMP),
    
    -- Mã mặc định (Unknown/Fallback)
    (999, 999, 'Không xác định', 'Unknown', 0, CURRENT_TIMESTAMP)
    
ON CONFLICT (weather_key) 
DO UPDATE SET
    name = EXCLUDED.name,
    main_category = EXCLUDED.main_category,
    severity_level = EXCLUDED.severity_level,
    record_timestamp = EXCLUDED.record_timestamp;

-- Verify seed data
SELECT 
    weather_key,
    weather_id,
    name,
    main_category,
    severity_level,
    record_timestamp
FROM dim_weather
ORDER BY severity_level DESC, weather_key;

-- Summary
SELECT 
    severity_level,
    COUNT(*) as count,
    STRING_AGG(weather_key::TEXT, ', ' ORDER BY weather_key) as weather_keys
FROM dim_weather
GROUP BY severity_level
ORDER BY severity_level DESC;
