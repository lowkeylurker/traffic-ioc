"""
TẦNG 2: DATA CONTRACTS - Pydantic Models

Định nghĩa:
- Request/Response schemas cho API endpoints
- Type validation tự động
- JSON serialization/deserialization

Export các schemas từ tất cả sub-modules.
"""

__all__ = [
    "ForecastRequest",
    "ForecastResponse",
    "CongestionPredictionRequest",
    "CongestionPredictionResponse",
    "ImputationRequest",
    "ImputationResponse",
]
