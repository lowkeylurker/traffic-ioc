from sqlalchemy import create_engine, text

engine = create_engine("postgresql://traffic_user:traffic_password@postgres:5432/traffic_ioc?sslmode=disable")

sql = text("""
WITH q1_segments AS (
    SELECT ds.segment_key, ds.way_key, ds.length_m
    FROM dim_segment ds
    WHERE ds.geometry_center IS NOT NULL
      AND ST_X(ds.geometry_center) BETWEEN :min_lon AND :max_lon
      AND ST_Y(ds.geometry_center) BETWEEN :min_lat AND :max_lat
),
road_base AS (
    SELECT
        r.road_key,
        r.name AS road_name,
        MIN(w.tomtom_frc) AS min_frc,
        AVG(COALESCE(w.default_lane_count, 2)) AS avg_lane_count,
        COUNT(qs.segment_key) AS segment_count,
        SUM(COALESCE(qs.length_m, 0)) AS total_length_m,
        BOOL_OR(
            w.osm_highway_type IN (
                'motorway','motorway_link','trunk','trunk_link',
                'primary','primary_link','secondary','secondary_link'
            )
        ) AS has_arterial_type
    FROM q1_segments qs
    JOIN dim_way w ON w.way_key = qs.way_key
    JOIN dim_road r ON r.road_key = w.road_key
    GROUP BY r.road_key, r.name
),
traffic_30d AS (
    SELECT
        w.road_key,
        AVG(COALESCE(f.pcu_volume, 0)) AS avg_pcu_volume,
        AVG(COALESCE(f.traffic_index, 0)) AS avg_traffic_index
    FROM fact_traffic_flow f
    JOIN dim_segment ds ON ds.segment_key = f.segment_key
    JOIN dim_way w ON w.way_key = ds.way_key
    WHERE f.date_key >= :since_date_key
    GROUP BY w.road_key
),
incident_30d AS (
    SELECT
        w.road_key,
        COUNT(*) AS incident_count
    FROM fact_incident i
    JOIN dim_segment ds ON ds.segment_key = i.segment_key
    JOIN dim_way w ON w.way_key = ds.way_key
    WHERE i.date_key >= :since_date_key
    GROUP BY w.road_key
),
ranked AS (
    SELECT
        rb.road_key,
        rb.road_name,
        rb.segment_count,
        rb.total_length_m,
        COALESCE(t.avg_pcu_volume, 0) AS avg_pcu_volume,
        COALESCE(t.avg_traffic_index, 0) AS avg_traffic_index,
        COALESCE(i.incident_count, 0) AS incident_count,
        (
            0.35 * LEAST(100.0, COALESCE(t.avg_traffic_index, 0) * 100.0)
            + 0.30 * LEAST(100.0, COALESCE(t.avg_pcu_volume, 0) / 20.0)
            + 0.20 * LEAST(100.0, COALESCE(i.incident_count, 0) * 5.0)
            + 0.15 * (
                0.6 * CASE
                    WHEN rb.min_frc IS NULL THEN 45.0
                    WHEN rb.min_frc <= 1 THEN 100.0
                    WHEN rb.min_frc = 2 THEN 85.0
                    WHEN rb.min_frc = 3 THEN 70.0
                    WHEN rb.min_frc = 4 THEN 55.0
                    ELSE 40.0
                END
                + 0.4 * LEAST(100.0, COALESCE(rb.avg_lane_count, 2) * 25.0)
            )
        ) AS priority_score
    FROM road_base rb
    LEFT JOIN traffic_30d t ON t.road_key = rb.road_key
    LEFT JOIN incident_30d i ON i.road_key = rb.road_key
    WHERE rb.segment_count >= 4
      AND rb.total_length_m >= 1200
      AND (rb.has_arterial_type = TRUE OR COALESCE(rb.min_frc, 6) <= 3)
)
SELECT
    r.road_name,
    ROUND(r.priority_score::numeric, 2) AS priority_score,
    r.segment_count,
    ROUND(r.total_length_m::numeric, 0) AS length_m,
    ROUND(r.avg_traffic_index::numeric, 3) AS avg_traffic_index,
    ROUND(r.avg_pcu_volume::numeric, 1) AS avg_pcu_volume,
    r.incident_count,
    CASE WHEN dc.corridor_key IS NULL THEN 'NO' ELSE 'YES' END AS already_in_dim_corridor
FROM ranked r
LEFT JOIN dim_corridor dc ON dc.corridor_name = ('Priority Corridor – ' || r.road_name)
ORDER BY r.priority_score DESC
LIMIT 25
""")

params = {
    "min_lon": 106.663,
    "max_lon": 106.723,
    "min_lat": 10.743,
    "max_lat": 10.803,
    "since_date_key": 20260208,
}

with engine.connect() as conn:
    rows = conn.execute(sql, params).fetchall()

out_path = "/app/q1_corridor_candidates.txt"
with open(out_path, "w", encoding="utf-8") as f:
    f.write("road_name|priority_score|segment_count|length_m|avg_traffic_index|avg_pcu_volume|incident_count|already_in_dim_corridor\n")
    for r in rows:
        f.write(f"{r.road_name}|{r.priority_score}|{r.segment_count}|{int(r.length_m)}|{r.avg_traffic_index}|{r.avg_pcu_volume}|{r.incident_count}|{r.already_in_dim_corridor}\n")
print("done")
