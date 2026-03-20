"""
feature_extractor.py - Feature Extraction for Clustering

Extract features từ dim_segment + fact_traffic_flow:

Features:
- geometry: segment_length, bearing, curvature
- speeds: avg_speed, peak_hour_speed, night_speed, std_speed
- traffic: congestion_frequency, incident_count, anomaly_count
- infrastructure: lane_count, speed_limit, road_type

Output: Feature vectors [n_segments, n_features]
Pure function, testable.
"""

# TODO: Triển khải trích xuất features clustering
