-- Bổ sung B-Tree index để tối ưu hiệu năng tra cứu lịch sử
-- Fact table đã partition, index hỗ trợ lọc theo khoảng thời gian và segment

CREATE INDEX IF NOT EXISTS idx_fact_traffic_flow_timestamp ON fact_traffic_flow (timestamp);

CREATE INDEX IF NOT EXISTS idx_fact_traffic_flow_segment_key ON fact_traffic_flow (segment_key);