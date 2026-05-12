"""Time-based feature helpers for traffic forecasting."""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
import pandas as pd


def _as_datetime_index(timestamp) -> pd.DatetimeIndex:
	if isinstance(timestamp, pd.DatetimeIndex):
		return timestamp
	if isinstance(timestamp, pd.Series):
		return pd.DatetimeIndex(pd.to_datetime(timestamp))
	if isinstance(timestamp, (list, tuple, np.ndarray, pd.Index)):
		return pd.DatetimeIndex(pd.to_datetime(timestamp))
	return pd.DatetimeIndex([pd.to_datetime(timestamp)])


def _normalize_holidays(holiday_dates: Iterable | None) -> set[pd.Timestamp]:
	if not holiday_dates:
		return set()
	return {pd.Timestamp(value).normalize() for value in holiday_dates}


def create_temporal_features(timestamp, holiday_dates: Iterable | None = None) -> pd.DataFrame:
	"""Create temporal features from one timestamp or a sequence of timestamps."""
	index = _as_datetime_index(timestamp)
	holidays = _normalize_holidays(holiday_dates)

	time_key = index.hour * 60 + index.minute
	return pd.DataFrame(
		{
			"timestamp": index,
			"hour": index.hour.astype(int),
			"day_of_week": index.dayofweek.astype(int),
			"month": index.month.astype(int),
			"is_weekend": index.dayofweek.isin([5, 6]),
			"is_holiday": [ts.normalize() in holidays for ts in index],
			"is_peak_hour": index.hour.isin([7, 8, 9, 17, 18, 19]),
			"time_key": time_key.astype(int),
			"time_sin": np.sin(2 * np.pi * time_key / 1440),
			"time_cos": np.cos(2 * np.pi * time_key / 1440),
		}
	)
