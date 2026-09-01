-- Create a flattened materialized view of dim_segment with road_key joined in.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_dim_segment_with_road_key AS
SELECT s.*, w.road_key
FROM dim_segment s
    LEFT JOIN dim_way w ON w.way_key = s.way_key;

-- Standard indexes for concurrent refresh and road-based filtering.
CREATE UNIQUE INDEX IF NOT EXISTS mv_dim_segment_with_road_key_segment_key_idx ON mv_dim_segment_with_road_key (segment_key);

CREATE INDEX IF NOT EXISTS mv_dim_segment_with_road_key_road_key_idx ON mv_dim_segment_with_road_key (road_key);
