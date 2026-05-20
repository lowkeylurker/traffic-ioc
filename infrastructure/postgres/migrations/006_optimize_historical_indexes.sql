-- Migration bổ sung chỉ mục tối ưu hóa chuyên sâu cho tra cứu lịch sử và báo cáo tổng hợp
-- Giúp tăng tốc độ Nested Loop Join và sắp xếp dữ liệu theo thời gian giảm dần

CREATE INDEX IF NOT EXISTS idx_fact_traffic_flow_segment_timestamp_desc 
ON fact_traffic_flow (segment_key, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_fact_traffic_flow_timestamp_desc 
ON fact_traffic_flow (timestamp DESC);
