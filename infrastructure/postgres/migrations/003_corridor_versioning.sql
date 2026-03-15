-- MIGRATION: Add corridor versioning for seed-driven corridor configuration
-- Purpose:
--   1) Track corridor config revisions in dim_corridor
--   2) Preserve historical fact_corridor_performance across versions

ALTER TABLE dim_corridor
    ADD COLUMN IF NOT EXISTS corridor_version INT NOT NULL DEFAULT 1;

ALTER TABLE dim_corridor
    ADD COLUMN IF NOT EXISTS seed_signature VARCHAR(64);

ALTER TABLE fact_corridor_performance
    ADD COLUMN IF NOT EXISTS corridor_version INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_fact_corridor_perf_corridor_version
    ON fact_corridor_performance (corridor_key, corridor_version);

-- Optional verification query (manual):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name IN ('dim_corridor', 'fact_corridor_performance')
-- ORDER BY table_name, ordinal_position;
