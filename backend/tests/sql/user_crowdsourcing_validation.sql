-- Validate verified-only feed ordering and ownership constraints.

-- 1) Insert a synthetic pending user report (replace values as needed).
INSERT INTO fact_incident (
  incident_key,
  time_key,
  date_key,
  segment_key,
  location_key,
  incident_type,
  timestamp,
  severity_level,
  delay_seconds,
  geometry,
  is_simulated,
  is_active,
  inserted_at,
  quality_flag,
  source,
  status,
  reporter_id,
  image_url,
  upvotes
)
SELECT
  COALESCE(MAX(incident_key), 0) + 1,
  (SELECT time_key FROM dim_time_of_day ORDER BY time_key LIMIT 1),
  TO_CHAR(NOW(), 'YYYYMMDD')::int,
  (SELECT segment_key FROM dim_segment ORDER BY segment_key LIMIT 1),
  (SELECT location_key FROM dim_location ORDER BY location_key LIMIT 1),
  'CONGESTION',
  NOW(),
  2,
  0,
  ST_SetSRID(ST_MakePoint(106.7009, 10.7769), 4326),
  FALSE,
  TRUE,
  NOW(),
  1,
  'USER_REPORT'::incident_source,
  'PENDING'::incident_status,
  'clerk_user_test_01',
  NULL,
  0
FROM fact_incident;

-- 2) Query rule for feed must return VERIFIED only and newest first.
SELECT
  incident_key,
  status,
  timestamp
FROM fact_incident
WHERE status = 'VERIFIED'::incident_status
ORDER BY timestamp DESC
LIMIT 20;

-- 3) Ownership update should affect only pending rows of same reporter.
-- Replace :incident_key with inserted key from step 1.
-- UPDATE fact_incident
-- SET incident_type = 'ACCIDENT'
-- WHERE incident_key = :incident_key
--   AND reporter_id = 'clerk_user_test_01'
--   AND status = 'PENDING'::incident_status;
