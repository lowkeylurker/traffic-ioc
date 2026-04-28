"""Unit tests for feature engineering helpers."""

from datetime import datetime

import numpy as np
import pandas as pd

from src.features.temporal_features import create_temporal_features
from src.features.traffic_features import (
	calculate_traffic_index,
	classify_congestion_level,
	classify_los,
	extract_traffic_features,
)


def test_create_temporal_features_returns_expected_columns() -> None:
	features = create_temporal_features(datetime(2026, 4, 9, 7, 15), holiday_dates=[datetime(2026, 4, 9)])

	assert list(features.columns) == [
		"timestamp",
		"hour",
		"day_of_week",
		"month",
		"is_weekend",
		"is_holiday",
		"is_peak_hour",
		"time_key",
		"time_sin",
		"time_cos",
	]
	assert features.iloc[0]["hour"] == 7
	assert bool(features.iloc[0]["is_holiday"]) is True
	assert bool(features.iloc[0]["is_peak_hour"]) is True


def test_extract_traffic_features_classifies_congestion() -> None:
	df = pd.DataFrame(
		{
			"current_speed_kmh": [30.0, 10.0],
			"free_flow_speed_kmh": [60.0, 60.0],
			"congestion_level": [2, 4],
		}
	)

	enriched = extract_traffic_features(df)

	assert np.isclose(enriched.loc[0, "traffic_index"], 0.5)
	assert int(enriched.loc[0, "congestion_level"]) == 2
	assert int(enriched.loc[1, "congestion_level"]) == 4
	assert "los_level" not in enriched.columns


def test_extract_traffic_features_optional_aux_levels() -> None:
	df = pd.DataFrame(
		{
			"current_speed_kmh": [30.0],
			"free_flow_speed_kmh": [60.0],
		}
	)

	enriched = extract_traffic_features(df, derive_aux_levels=True)

	assert classify_los(enriched.loc[0, "traffic_index"]) == "D"
	assert classify_congestion_level(0.75) == 5


def test_calculate_traffic_index_handles_invalid_free_flow() -> None:
	assert np.isnan(calculate_traffic_index(30.0, 0.0))
