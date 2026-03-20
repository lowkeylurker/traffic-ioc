"""
forecast_schema.py - Mã Dự đoán Tốc độ

Định nghĩa Pydantic models cho API dự đoán tốc độ giao thông.

Yêu cầu:
- segment_id: ID của đoạn đường
- current_time: Thời điểm hiện tại (ISO 8601)
- forecast_horizon: Số phút cần dự báo (mặc định: 15)
- include_confidence: Bao gồm Điểm tin cậ y?

Phản hồi:
- segment_id, forecast_time
- predictions: Danh sách (timestamp, tốc độ dự đoán, điểm tin cậ y, LOS dự đoán)
- model_version: Phiên bản mô hình được sử dụng
"""

# TODO: Triển khai Pydantic Request/Response models
