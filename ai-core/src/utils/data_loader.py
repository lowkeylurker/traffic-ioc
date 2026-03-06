"""
data_loader.py - Data Loading from Database

Cung cấp functions để fetch data từ PostgreSQL:
- query_traffic_flow(segment_id, start_time, end_time): Fetch fact_traffic_flow
- query_segment_info(segment_id): Fetch dim_segment info
- query_weather(segment_id, timestamp): Fetch weather data
- query_incident_data(segment_id, start_time, end_time): Fetch incident info

Returns pandas DataFrame hoặc structured data.
"""

# TODO: Triển khải các hàm truy vấn cơ sở dữ liệu
