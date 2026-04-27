-- MIGRATION: Create Quận 1 segment materialized view for hybrid incident-flow mapping
-- Purpose:
--   1) Reuse a static Q1 segment subset (avoid repeating expensive spatial joins)
--   2) Add indexes required for fast spatial lookup + REFRESH CONCURRENTLY

DROP MATERIALIZED VIEW IF EXISTS dim_segment_q1;

CREATE MATERIALIZED VIEW dim_segment_q1 AS
SELECT DISTINCT
    ds.segment_key,
    ds.geometry_center
FROM dim_segment ds
JOIN dim_location dl
    ON dl.geometry_polygon IS NOT NULL
   AND ds.geometry_center IS NOT NULL
   AND ST_Covers(dl.geometry_polygon, ds.geometry_center)
WHERE
    LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
    OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
    OR LOWER(TRIM(dl.district)) LIKE '%district 1%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_segment_q1_segment_key
    ON dim_segment_q1 (segment_key);

CREATE INDEX IF NOT EXISTS idx_dim_segment_q1_geom_center_gist
    ON dim_segment_q1 USING GIST (geometry_center);
