"""
TẦNG 7: API LAYER - FastAPI Application

Cung cấp:
- FastAPI app factory
- Route blueprints
- Shared dependencies (models, DB session)

Endpoints:
- POST /api/v1/forecast - Dự báo tốc độ
- POST /api/v1/congestion-prediction - Dự báo tắc nghẽn (RL)
- POST /api/v1/impute-missing-data - Fill dữ liệu thiếu (Clustering)

Chạy: uvicorn src.api.app:app --port 5000
"""

__all__ = ["app", "get_app"]
