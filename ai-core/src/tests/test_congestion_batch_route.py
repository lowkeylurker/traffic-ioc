from datetime import datetime

import pandas as pd
from fastapi.testclient import TestClient

from src.api.app import app
from src.api.dependencies import get_warmstart_rl_predictor, get_warmstart_rl_predictor_by_horizon


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
    app.dependency_overrides[get_warmstart_rl_predictor_by_horizon] = lambda h: _DummyPredictor()

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
    app.dependency_overrides[get_warmstart_rl_predictor_by_horizon] = lambda h: _DummyPredictor()

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
    app.dependency_overrides[get_warmstart_rl_predictor_by_horizon] = lambda h: _DummyPredictor()

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


def test_batch_reuses_candidate_forecast_cache(monkeypatch):
    from src.api.routes import congestion as route

    calls = []

    def _forecast_for_request(**kwargs):
        segment_ids = kwargs["segment_ids"]
        calls.append(tuple(segment_ids))
        if segment_ids == [999]:
            return _make_df(999)
        return pd.DataFrame()

    monkeypatch.setattr(route, "forecast_for_request", _forecast_for_request)
    monkeypatch.setattr(route, "get_corridors_by_segment", lambda segment_id: [1])
    monkeypatch.setattr(route, "get_nearest_segments_in_corridor", lambda segment_id, corridor_id, limit: [(999, 120.5)])
    app.dependency_overrides[get_warmstart_rl_predictor] = lambda: _DummyPredictor()
    app.dependency_overrides[get_warmstart_rl_predictor_by_horizon] = lambda h: _DummyPredictor()

    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/congestion-prediction/batch",
            json={"segment_ids": [101, 102], "request_time": "2026-04-09T09:30:00"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["success_count"] == 2
        assert all(item["reason_code"] == "FALLBACK_NEAREST" for item in payload["items"])

        # One batch call + one cached fallback-candidate call.
        assert calls.count((101, 102)) == 1
        assert calls.count((999,)) == 1
    finally:
        app.dependency_overrides.clear()


def test_benchmark_endpoint(monkeypatch):
    """Test that benchmark endpoint returns valid structure and metrics."""
    from src.api.routes import congestion as route

    def _forecast_for_request(**kwargs):
        # Return some segments with data, some without
        segment_ids = kwargs["segment_ids"]
        rows = []
        for i, sid in enumerate(segment_ids):
            if i % 2 == 0:  # Every other segment has data
                rows.append({
                    "Segment_ID": sid,
                    "Forecast_For_Time": "2026-04-09 09:30:00",
                    "Dự báo (15p tới)": "Mức 3 (Kẹt)",
                })
        return pd.DataFrame(rows) if rows else pd.DataFrame()

    monkeypatch.setattr(route, "forecast_for_request", _forecast_for_request)
    monkeypatch.setattr(route, "get_benchmark_segment_pool", lambda limit=5000: list(range(1, 200)))
    app.dependency_overrides[get_warmstart_rl_predictor] = lambda: _DummyPredictor()
    app.dependency_overrides[get_warmstart_rl_predictor_by_horizon] = lambda h: _DummyPredictor()

    try:
        client = TestClient(app)
        response = client.post(
			"/api/internal/v1/congestion-prediction/benchmark",
            json={"batch_size": 10, "num_runs": 2, "seed": 42},
        )
        assert response.status_code == 200
        payload = response.json()
        
        # Validate response structure
        assert "batch_size" in payload
        assert "num_runs" in payload
        assert "total_time_ms" in payload
        assert "p50_latency_ms" in payload
        assert "p95_latency_ms" in payload
        assert "avg_latency_ms" in payload
        assert "throughput_per_second" in payload
        assert "success_rate_pct" in payload
        assert "direct_hit_rate_pct" in payload
        assert "fallback_hit_rate_pct" in payload
        assert "no_data_rate_pct" in payload
        assert "model_profile" in payload
        
        # Validate values
        assert payload["batch_size"] == 10
        assert payload["num_runs"] == 2
        assert payload["total_time_ms"] > 0
        assert payload["p50_latency_ms"] > 0
        assert payload["p95_latency_ms"] > 0
        assert payload["avg_latency_ms"] > 0
        assert payload["throughput_per_second"] > 0
        assert 0 <= payload["success_rate_pct"] <= 100
        assert 0 <= payload["direct_hit_rate_pct"] <= 100
        assert 0 <= payload["fallback_hit_rate_pct"] <= 100
        assert 0 <= payload["no_data_rate_pct"] <= 100
        assert payload["direct_hit_rate_pct"] + payload["fallback_hit_rate_pct"] + payload["no_data_rate_pct"] <= 100
        assert payload["model_profile"] == "warmstart"
    finally:
        app.dependency_overrides.clear()
