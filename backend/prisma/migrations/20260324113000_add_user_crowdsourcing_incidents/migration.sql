-- Add enum types for user crowdsourcing workflow
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_source') THEN
    CREATE TYPE incident_source AS ENUM ('SENSOR', 'ADMIN', 'USER_REPORT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_status') THEN
    CREATE TYPE incident_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'RESOLVED');
  END IF;
END $$;

-- Extend fact_incident with moderation and ownership attributes.
ALTER TABLE fact_incident
  ADD COLUMN IF NOT EXISTS source incident_source,
  ADD COLUMN IF NOT EXISTS status incident_status,
  ADD COLUMN IF NOT EXISTS reporter_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS upvotes INTEGER;

ALTER TABLE fact_incident
  ALTER COLUMN upvotes SET DEFAULT 0;

UPDATE fact_incident
SET upvotes = 0
WHERE upvotes IS NULL;

ALTER TABLE fact_incident
  ALTER COLUMN upvotes SET NOT NULL;

-- Backfill source/status for legacy rows.
UPDATE fact_incident
SET source = COALESCE(source, 'SENSOR'::incident_source),
    status = COALESCE(status, CASE WHEN COALESCE(is_active, true) THEN 'VERIFIED'::incident_status ELSE 'RESOLVED'::incident_status END)
WHERE source IS NULL OR status IS NULL;

ALTER TABLE fact_incident
  ALTER COLUMN source SET DEFAULT 'SENSOR'::incident_source,
  ALTER COLUMN status SET DEFAULT 'VERIFIED'::incident_status;

ALTER TABLE fact_incident
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN status SET NOT NULL;

-- Indexes for feed and moderation queries.
CREATE INDEX IF NOT EXISTS idx_fact_incident_status_ts ON fact_incident (status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fact_incident_source_status ON fact_incident (source, status);
CREATE INDEX IF NOT EXISTS idx_fact_incident_reporter ON fact_incident (reporter_id);
CREATE INDEX IF NOT EXISTS idx_fact_incident_verified_ts ON fact_incident (timestamp DESC) WHERE status = 'VERIFIED'::incident_status;
