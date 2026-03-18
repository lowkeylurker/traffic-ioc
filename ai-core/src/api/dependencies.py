"""
dependencies.py - Shared Dependencies for API Endpoints

Provides:
- get_db(): Database session (dependency injection)
- get_forecast_model(): Lazy-load forecasting models
- get_rl_agent(): Lazy-load RL agent
- get_clusterer(): Lazy-load clustering model

Sử dụng FastAPI dependency injection.
"""

from fastapi import Depends

# TODO: Triển khải các hàm dependency injection
