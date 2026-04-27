-- MIGRATION: Auto-map Q1 arterial roads into dim_corridor/bridge and rebuild dim_segment_q1
-- Purpose:
--   1) Ensure business corridors exist for selected Q1 roads
--   2) Auto-map matching OSM segments into bridge_corridor_segment
--   3) Rebuild dim_segment_q1 with both business + spatial filters

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- STEP 1: Ensure dim_corridor rows exist (idempotent)
-- corridor_key follows Python generate_corridor_key():
--   int(sha256(corridor_name).hexdigest()[:15], 16)
-- ============================================================================
WITH corridor_seed(corridor_name) AS (
    VALUES
        ('Lê Duẩn'),
        ('Pasteur'),
        ('Nguyễn Trãi'),
        ('Hai Bà Trưng'),
        ('Điện Biên Phủ'),
        ('Tôn Đức Thắng'),
        ('Hàm Nghi'),
        ('Trần Hưng Đạo'),
        ('Võ Văn Kiệt'),
        ('Đinh Tiên Hoàng'),
        ('Cống Quỳnh'),
        ('Lê Lai'),
        ('Nguyễn Văn Cừ'),
        ('Calmette'),
        ('Nguyễn Đình Chiểu'),
        ('Nam Kỳ Khởi Nghĩa'),
        ('Nguyễn Bỉnh Khiêm'),
        ('Phạm Ngũ Lão'),
        ('Trần Cao Vân'),
        ('Nguyễn Thái Học')
), corridor_payload AS (
    SELECT
        corridor_name,
        (('x' || substr(encode(digest(corridor_name, 'sha256'), 'hex'), 1, 15))::bit(60)::bigint) AS corridor_key
    FROM corridor_seed
)
INSERT INTO dim_corridor (
    corridor_key,
    corridor_name,
    importance_level,
    corridor_version,
    seed_signature,
    target_avg_speed,
    direction,
    record_timestamp
)
SELECT
    p.corridor_key,
    p.corridor_name,
    1 AS importance_level,
    1 AS corridor_version,
    'auto_q1_import' AS seed_signature,
    40::DECIMAL(5,2) AS target_avg_speed,
    'Both' AS direction,
    NOW() AS record_timestamp
FROM corridor_payload p
ON CONFLICT (corridor_key) DO UPDATE
SET
    corridor_name = EXCLUDED.corridor_name,
    importance_level = EXCLUDED.importance_level,
    seed_signature = EXCLUDED.seed_signature,
    target_avg_speed = EXCLUDED.target_avg_speed,
    direction = EXCLUDED.direction,
    record_timestamp = EXCLUDED.record_timestamp;

-- ============================================================================
-- STEP 2: Auto-map bridge_corridor_segment
-- - Prefer dim_segment.name when available
-- - Fallback to dim_road.name via dim_way when dim_segment.name is absent
-- ============================================================================
DO $$
DECLARE
    has_segment_name BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'dim_segment'
          AND column_name = 'name'
    ) INTO has_segment_name;

    IF has_segment_name THEN
        EXECUTE $sql$
            WITH matched AS (
                SELECT
                    c.corridor_key,
                    s.segment_key,
                    ROW_NUMBER() OVER (
                        PARTITION BY c.corridor_key
                        ORDER BY s.segment_key
                    ) AS sequence_order
                FROM dim_corridor c
                JOIN dim_segment s
                  ON s.geometry_center IS NOT NULL
                 AND LOWER(TRIM(s.name)) = LOWER(TRIM(c.corridor_name))
                WHERE c.importance_level = 1
                  AND c.seed_signature = 'auto_q1_import'
            )
            INSERT INTO bridge_corridor_segment (corridor_key, segment_key, sequence_order)
            SELECT corridor_key, segment_key, sequence_order
            FROM matched
            ON CONFLICT (corridor_key, segment_key) DO NOTHING
        $sql$;
    ELSE
        EXECUTE $sql$
            WITH matched AS (
                SELECT
                    c.corridor_key,
                    s.segment_key,
                    ROW_NUMBER() OVER (
                        PARTITION BY c.corridor_key
                        ORDER BY s.segment_key
                    ) AS sequence_order
                FROM dim_corridor c
                                JOIN dim_segment s ON s.geometry_center IS NOT NULL
                                JOIN dim_way w ON w.way_key = s.way_key
                JOIN dim_road r ON r.road_key = w.road_key
                WHERE c.importance_level = 1
                  AND c.seed_signature = 'auto_q1_import'
                  AND LOWER(TRIM(r.name)) = LOWER(TRIM(c.corridor_name))
            )
            INSERT INTO bridge_corridor_segment (corridor_key, segment_key, sequence_order)
            SELECT corridor_key, segment_key, sequence_order
            FROM matched
            ON CONFLICT (corridor_key, segment_key) DO NOTHING
        $sql$;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Rebuild dim_segment_q1 materialized view (business + spatial join)
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS dim_segment_q1;

CREATE MATERIALIZED VIEW dim_segment_q1 AS
SELECT DISTINCT
    s.segment_key,
    s.geometry_center
FROM dim_segment s
JOIN bridge_corridor_segment bcs
    ON bcs.segment_key = s.segment_key
JOIN dim_corridor c
    ON c.corridor_key = bcs.corridor_key
   AND c.importance_level = 1
   AND c.seed_signature = 'auto_q1_import'
JOIN dim_location dl
    ON dl.geometry_polygon IS NOT NULL
   AND s.geometry_center IS NOT NULL
   AND ST_Covers(dl.geometry_polygon, s.geometry_center)
WHERE
    LOWER(TRIM(dl.district)) IN ('quận 1', 'quan 1', 'district 1', 'q1')
    OR LOWER(TRIM(dl.district)) LIKE '%quận 1%'
    OR LOWER(TRIM(dl.district)) LIKE '%district 1%';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dim_segment_q1_segment_key
    ON dim_segment_q1 (segment_key);

CREATE INDEX IF NOT EXISTS idx_dim_segment_q1_geom_center_gist
    ON dim_segment_q1 USING GIST (geometry_center);
