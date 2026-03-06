"""
congestion_rl_schema.py - Congestion Prediction Request/Response Models

Định nghĩa Pydantic models cho congestion prediction endpoint (Reinforcement Learning).

Request:
- segment_id: ID của đoạn đường
- current_time: Thời điểm hiện tại (ISO 8601)
- prediction_horizon: Số phút cần dự báo (15 phút)
- include_confidence: Include confidence?

Response:
- segment_id, current_time, prediction_time
- will_be_congested: Boolean prediction (congested/free)
- congestion_probability: Xác suất tắc nghẽn (0.0-1.0)
- predicted_traffic_index: TI tương ứng
- predicted_los: Level of Service (A-F)
- confidence_score: Độ tin cậy
- model_version: RL model version
"""

# TODO: Triển khải Pydantic Request/Response models cho RL
