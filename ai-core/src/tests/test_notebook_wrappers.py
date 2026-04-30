from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.pipelines.notebook01_etl import (
    Notebook01ETLConfig,
    _collect_dataframes,
    run_notebook01_etl,
    validate_notebook01_output,
)
from src.rl.training.notebook_api import RLTrainingConfig, run_rl, validate_warmstart_inputs


@pytest.fixture
def sample_feature_frame() -> pd.DataFrame:
    timestamps = pd.date_range("2026-04-01 06:00:00", periods=4, freq="15min")
    return pd.DataFrame(
        {
            "segment_key": [1001, 1001, 1002, 1002],
            "timestamp": timestamps,
            "current_speed_kmh": [25.0, 24.0, 35.0, 36.0],
            "traffic_index": [0.3, 0.35, 0.2, 0.18],
            "delay_seconds": [12.0, 15.0, 8.0, 7.0],
            "quality_flag": [1.0, 1.0, 1.0, 1.0],
            "speed_ratio": [0.55, 0.50, 0.78, 0.82],
            "default_lane_count": [2.0, 2.0, 3.0, 3.0],
            "free_flow_speed_kmh": [45.0, 45.0, 45.0, 45.0],
            "time_sin": [0.0, 0.1, 0.2, 0.3],
            "time_cos": [1.0, 0.99, 0.98, 0.95],
            "is_peak_hour": [1, 1, 1, 1],
            "is_business_hours": [1, 1, 1, 1],
            "is_weekend": [0, 0, 0, 0],
            "tomtom_frc": [3, 3, 4, 4],
            "weather_key": [800, 800, 800, 800],
            "shift_code": [1, 1, 1, 1],
            "day_of_week": [2, 2, 2, 2],
            "congestion_level": [2, 3, 1, 2],
        }
    )


def test_validate_notebook01_output_success(sample_feature_frame: pd.DataFrame) -> None:
    report = validate_notebook01_output(sample_feature_frame)
    assert report["missing_columns"] == []
    assert report["rows"] == len(sample_feature_frame)


def test_run_notebook01_etl_writes_parquet(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, sample_feature_frame: pd.DataFrame) -> None:
    def _mock_load_bulk_corridor_data(corridor_id: int, start_date: str, end_date: str, peak_hours_only: bool = True):
        return {1001: sample_feature_frame.iloc[:2].copy(), 1002: sample_feature_frame.iloc[2:].copy()}

    monkeypatch.setattr("src.pipelines.notebook01_etl.load_bulk_corridor_data", _mock_load_bulk_corridor_data)

    output_path = tmp_path / "01_processed_features.parquet"
    config = Notebook01ETLConfig(
        start_date="2026-04-01",
        end_date="2026-04-02",
        output_path=str(output_path),
        corridor_ids=[12345],
    )

    result = run_notebook01_etl(config)

    assert output_path.exists()
    assert result.rows == len(sample_feature_frame)
    reloaded = pd.read_parquet(output_path)
    assert len(reloaded) == len(sample_feature_frame)


def test_collect_dataframes_falls_back_to_default_corridors(monkeypatch: pytest.MonkeyPatch) -> None:
    def _mock_load_bulk_corridor_data(corridor_id: int, start_date: str, end_date: str, peak_hours_only: bool = True):
        return {
            corridor_id: pd.DataFrame(
                {
                    "segment_key": [101, 202],
                    "timestamp": [pd.Timestamp("2026-04-01 06:00:00"), pd.Timestamp("2026-04-01 06:15:00")],
                    "current_speed_kmh": [30.0, 28.0],
                    "traffic_index": [0.2, 0.25],
                    "delay_seconds": [5.0, 6.0],
                    "quality_flag": [1.0, 1.0],
                    "speed_ratio": [0.6, 0.55],
                    "default_lane_count": [2.0, 3.0],
                    "free_flow_speed_kmh": [45.0, 45.0],
                    "time_sin": [0.0, 0.1],
                    "time_cos": [1.0, 0.99],
                    "is_peak_hour": [1, 1],
                    "is_business_hours": [1, 1],
                    "is_weekend": [0, 0],
                    "tomtom_frc": [3, 4],
                    "weather_key": [800, 800],
                    "shift_code": [1, 1],
                    "day_of_week": [2, 2],
                    "congestion_level": [2, 3],
                }
            )
        }

    monkeypatch.setattr("src.pipelines.notebook01_etl.load_bulk_corridor_data", _mock_load_bulk_corridor_data)

    cfg = Notebook01ETLConfig(start_date="2026-04-01", end_date="2026-04-02", output_path="/tmp/noop.parquet")
    frames = _collect_dataframes(cfg)

    # Fallback uses DEFAULT_CORRIDOR_IDS (15 corridors), so expect 15 frames
    assert len(frames) == 15
    assert frames[0].shape[0] == 2


def test_validate_warmstart_inputs(tmp_path: Path) -> None:
    prep = tmp_path / "prep.pkl"
    ckpt = tmp_path / "baseline.pt"
    prep.write_text("x", encoding="utf-8")
    ckpt.write_text("x", encoding="utf-8")

    cfg = RLTrainingConfig(artifacts_path=str(prep), pretrained_model_path=str(ckpt))
    validate_warmstart_inputs(cfg)


def test_run_rl_notebook_api_returns_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    metrics_path = tmp_path / "metrics.json"

    def _mock_run_rl_training(mode: str, config: RLTrainingConfig | None = None) -> None:
        metrics_path.write_text('{"eval_summary": {"macro_f1": 0.5}}', encoding="utf-8")

    monkeypatch.setattr("src.rl.training.notebook_api.run_rl_training", _mock_run_rl_training)

    cfg = RLTrainingConfig(run_id="unit_test", metrics_out=str(metrics_path))
    out = run_rl("pure", config=cfg)

    assert out["mode"] == "pure"
    assert out["run_id"] == "unit_test"
    assert out["metrics"]["eval_summary"]["macro_f1"] == 0.5
