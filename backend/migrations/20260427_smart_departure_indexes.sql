-- Composite index for smart departure on-the-fly aggregation query.
-- Covers segment filter + weekday extraction + time-of-day window and allows index-only read of speed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fact_traffic_flow_segment_dow_time
ON fact_traffic_flow (
  segment_key,
  ((EXTRACT(ISODOW FROM "timestamp"))::int),
  ("timestamp"::time)
)
INCLUDE (current_speed_kmh)
WHERE current_speed_kmh IS NOT NULL AND current_speed_kmh > 0;

-- Optional supporting index for fast segment length lookup if dim_segment is large.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dim_segment_segment_key
ON dim_segment (segment_key)
INCLUDE (length_m);
