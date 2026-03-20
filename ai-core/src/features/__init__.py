"""
TẦNG 3: FEATURE ENGINEERING - Extract & Transform Features

Chuyên môn:
- Extract features từ fact_traffic_flow (từ DB)
- Tạo temporal features (hour, day, season, ...)
- Tạo sliding window từ time series data

Tất cả hàm phải là PURE FUNCTIONS:
- Input: List/Dict/primitive types
- Output: ndarray or list
- NO side effects, NO database queries
"""

__all__ = [
    "extract_traffic_features",
    "create_temporal_features",
    "create_sliding_windows",
]
