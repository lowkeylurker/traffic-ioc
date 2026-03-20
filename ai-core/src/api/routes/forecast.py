"""
forecast.py - Traffic Speed Forecasting Endpoint

Endpoint: POST /api/v1/forecast

Workflow:
1. Validate request (segment_id, current_time)
2. Fetch data từ DB (fact_traffic_flow history)
3. Extract features (traffic + temporal)
4. Create sliding windows
5. Run forecasting models (LSTM + RF + Ensemble)
6. Return predictions + confidence

Response: ForecastResponse schema
"""

from fastapi import APIRouter, Depends

# TODO: Triển khải forecast endpoint
