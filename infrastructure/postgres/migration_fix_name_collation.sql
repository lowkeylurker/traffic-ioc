-- ==============================================================================
-- MIGRATION: Fix encoding for dim_weather.name column
-- Purpose: Ensure Vietnamese text displays correctly
-- ==============================================================================

-- Set UTF-8 collation for the name column
ALTER TABLE dim_weather ALTER COLUMN name TYPE VARCHAR(100) COLLATE "en_US.utf8";

-- Verify the change
SELECT column_name, data_type, collation_name 
FROM information_schema.columns 
WHERE table_name='dim_weather' AND column_name='name';

-- Test Vietnamese text
SELECT weather_key, name FROM dim_weather WHERE weather_key IN (200, 300, 500, 701, 800, 999);
