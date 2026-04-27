-- MIGRATION: Add hybrid incident/flow support columns
-- Purpose:
--   1) Persist TomTom incident source labels for downstream jam logic
--   2) Mark traffic-flow rows that were triggered by incidents

ALTER TABLE fact_incident
    ADD COLUMN IF NOT EXISTS icon_category SMALLINT;

ALTER TABLE fact_incident
    ADD COLUMN IF NOT EXISTS magnitude_of_delay SMALLINT;

ALTER TABLE fact_traffic_flow
    ADD COLUMN IF NOT EXISTS congestion_label VARCHAR(50);

ALTER TABLE fact_traffic_flow
    ADD COLUMN IF NOT EXISTS is_incident_triggered BOOLEAN DEFAULT FALSE;
