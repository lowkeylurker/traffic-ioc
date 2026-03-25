-- =============================================================================
-- FILE: 6_create_fact_citizen_report.sql
-- DESCRIPTION: SQL-first schema for citizen incident reports moderation workflow.
-- NOTE:
--   1) User reports are stored in fact_citizen_report.
--   2) Only APPROVED reports are promoted into fact_incident by backend service.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'citizen_report_status') THEN
        CREATE TYPE citizen_report_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS fact_citizen_report (
    report_key            BIGSERIAL PRIMARY KEY,
    time_key              INT             NOT NULL REFERENCES dim_time_of_day(time_key),
    date_key              INT             NOT NULL REFERENCES dim_date(date_key),
    segment_key           BIGINT          NOT NULL REFERENCES dim_segment(segment_key),
    location_key          BIGINT          REFERENCES dim_location(location_key),
    incident_type         VARCHAR(50)     NOT NULL,
    description           TEXT,
    image_url             TEXT,
    timestamp             TIMESTAMP       NOT NULL,
    geometry              GEOMETRY(Point, 4326) NOT NULL,
    reporter_id           VARCHAR(255)    NOT NULL,
    status                citizen_report_status NOT NULL DEFAULT 'PENDING',
    moderation_note       TEXT,
    moderated_by          VARCHAR(255),
    approved_incident_key BIGINT,
    approved_at           TIMESTAMP,
    rejected_at           TIMESTAMP,
    created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_status ON fact_citizen_report(status);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_reporter ON fact_citizen_report(reporter_id);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_created_at ON fact_citizen_report(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_ts ON fact_citizen_report(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_geom_gist ON fact_citizen_report USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_segment_date ON fact_citizen_report(segment_key, date_key);
CREATE INDEX IF NOT EXISTS idx_fact_citizen_report_approved_incident ON fact_citizen_report(approved_incident_key);
