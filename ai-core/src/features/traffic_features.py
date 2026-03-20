"""
traffic_features.py - Extract Traffic Features

Extract features từ fact_traffic_flow records:
- current_speed: Tốc độ hiện tại (km/h)
- traffic_index: 1.0 - (current_speed / free_flow_speed)
- los_level: Level of Service (A-F)
- congestion_level: 0-5 (numeric)

Pure functions, testable, không query DB trực tiếp.
"""

# TODO: Triển khải trích xuất features giao thông
