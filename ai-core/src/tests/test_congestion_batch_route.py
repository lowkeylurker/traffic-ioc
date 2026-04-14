from datetime import datetime

import pandas as pd
from fastapi.testclient import TestClient

from src.api.app import app
from src.api.dependencies import get_warmstart_rl_predictor


class _DummyPredictor:
    pass


def _make_df(segment_id: int, forecast_time: str = "2026-04-09 09:30:00") -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Segment_ID": segment_id,
                "Forecast_For_Time": forecast_time,
                "Dự báo (15p tới)": "Mức 4 (Kẹt nặng)",
            }
        ]
    )


def test_batch_direct_reason_code(monkeypatch):
    from src.api.routes import congestion as route

    def _forecast_for_request(**kwargs):
        segment_ids = kwargs["segment_ids"]
        if segment_ids == [101]:
            return _make_df(101)
        return pd.DataFrame()

    monkeypatch.setattr(route, "forecast_for_request", _forecast_for_request)
    app.dependency_overrides[get_warmstart_rl_predictor] = lambda: _DummyPredictor()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/congestion-prediction/batch",
            json={"segment_ids": [101], "request_time": "2026-04-09T09:30:00"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success_count"] == 1
        item = payload["items"][0]
        assert item["reason_code"] == "DIRECT"
        assert item["used_fallback"] is False
    finally:
        app.dependency_overrides.clear()


def test_batch_fallback_nearest_reason_code(monkeypatch):
    from src.api.routes import congestion as route

    def _forecast_for_request(**kwargs):
        segment_ids = kwargs["segment_ids"]
        if segment_ids == [999]:
            return _make_df(999)
        return pd.DataFrame()

    monkeypatch.setattr(route, "forecast_for_request", _forecast_for_request)
    monkeypatch.setattr(route, "get_corridors_by_segment", lambda segment_id: [1])
    monkeypatch.setattr(route, "get_nearest_segments_in_corridor", lambda segment_id, corridor_id, limit: [(999, 120.5)])
    app.dependency_overrides[get_warmstart_rl_predictor] = lambda: _DummyPredictor()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/congestion-prediction/batch",
            json={"segment_ids": [101], "request_time": "2026-04-09T09:30:00"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success_count"] == 1
        item = payload["items"][0]
        assert item["segment_id"] == 101
        assert item["source_segment_id"] == 999
        assert item["used_fallback"] is True
        assert item["reason_code"] == "FALLBACK_NEAREST"
    finally:
        app.dependency_overrides.clear()


def test_batch_fallback_distance_exceeded_reason_code(monkeypatch):
    from src.api.routes import congestion as route

    def _forecast_for_request(**kwargs):
        return pd.DataFrame()

    monkeypatch.setattr(route, "forecast_for_request", _forecast_for_request)
    monkeypatch.setattr(route, "get_corridors_by_segment", lambda segment_id: [1])
    monkeypatch.setattr(route, "get_nearest_segments_in_corridor", lambda segment_id, corridor_id, limit: [(999, 99999.0)])
    app.dependency_overrides[get_warmstart_rl_predictor] = lambda: _DummyPredictor()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/congestion-prediction/batch",
            json={"segment_ids": [101], "request_time": "2026-04-09T09:30:00"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["no_data_count"] == 1
        item = payload["items"][0]
        assert item["reason_code"] == "FALLBACK_DISTANCE_EXCEEDED"
        assert item["used_fallback"] is False
    finally:
        app.dependency_overrides.clear()
