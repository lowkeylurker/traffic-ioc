-- ==============================================================================
-- FILE: 004_weather_impact_view.sql
-- DESCRIPTION: Tạo view vw_weather_impact để phân tích mức độ ảnh hưởng của thời tiết
-- ==============================================================================

CREATE OR REPLACE VIEW vw_weather_impact AS
SELECT 
    *,
    CASE 
        WHEN condition_code IN ('Clear', 'Clouds') THEN 'NONE'
        WHEN condition_code IN ('Rain', 'Drizzle') THEN 'MEDIUM'
        WHEN condition_code IN ('Thunderstorm', 'Extreme', 'Tornado') THEN 'HIGH'
        ELSE 'UNKNOWN'
    END AS impact_level,
    CASE 
        WHEN condition_code IN ('Clear', 'Clouds') THEN 'Thời tiết bình thường'
        WHEN condition_code IN ('Rain', 'Drizzle') THEN 'Đường trơn, giảm tốc độ'
        WHEN condition_code IN ('Thunderstorm', 'Extreme', 'Tornado') THEN 'Mưa bão nguy hiểm'
        ELSE 'Theo dõi thêm'
    END AS warning_message
FROM fact_weather;
