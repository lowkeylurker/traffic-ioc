"""
app.py - FastAPI Application Factory

Đây là entry point chính cho uvicorn.
Import app từ src.main để tránh circular dependency.

Chạy: uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload
"""

from src.main import app
from src.api.routes.congestion import internal_router as congestion_internal_router
from src.api.routes.congestion import router as congestion_router


def _ensure_router_registered() -> None:
	target_path_public = "/api/v1/congestion-prediction/batch"
	if not any(getattr(route, "path", "") == target_path_public for route in app.routes):
		app.include_router(congestion_router)

	target_path_internal = "/api/internal/v1/congestion-prediction/benchmark"
	if not any(getattr(route, "path", "") == target_path_internal for route in app.routes):
		app.include_router(congestion_internal_router)


_ensure_router_registered()

__all__ = ["app"]
