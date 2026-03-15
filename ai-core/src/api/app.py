"""
app.py - FastAPI Application Factory

Đây là entry point chính cho uvicorn.
Import app từ src.main để tránh circular dependency.

Chạy: uvicorn src.api.app:app --host 0.0.0.0 --port 5000 --reload
"""

from src.main import app

__all__ = ["app"]
