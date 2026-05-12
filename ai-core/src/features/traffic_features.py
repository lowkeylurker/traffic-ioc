"""Traffic feature helpers for congestion modeling."""

from __future__ import annotations

import numpy as np
import pandas as pd


def calculate_traffic_index(current_speed_kmh, free_flow_speed_kmh):
	if pd.isna(current_speed_kmh) or pd.isna(free_flow_speed_kmh):
		return np.nan
	if float(free_flow_speed_kmh) <= 0:
		return np.nan
	traffic_index = 1.0 - (float(current_speed_kmh) / float(free_flow_speed_kmh))
	return float(np.clip(traffic_index, 0.0, 1.0))


def classify_los(traffic_index):
	if pd.isna(traffic_index):
		return None
	if traffic_index <= 0.10:
		return "A"
	if traffic_index <= 0.20:
		return "B"
	if traffic_index <= 0.35:
		return "C"
	if traffic_index <= 0.50:
		return "D"
	if traffic_index <= 0.70:
		return "E"
	return "F"


def classify_congestion_level(traffic_index):
	if pd.isna(traffic_index):
		return np.nan
	if traffic_index <= 0.10:
		return 0
	if traffic_index <= 0.20:
		return 1
	if traffic_index <= 0.35:
		return 2
	if traffic_index <= 0.50:
		return 3
	if traffic_index <= 0.70:
		return 4
	return 5


def extract_traffic_features(
	data: pd.DataFrame,
	current_speed_col: str = "current_speed_kmh",
	free_flow_col: str = "free_flow_speed_kmh",
	traffic_index_col: str = "traffic_index",
	derive_aux_levels: bool = False,
) -> pd.DataFrame:
	"""Normalize traffic index and optionally derive LOS / congestion levels."""
	if data.empty:
		return data.copy()

	df = data.copy()
	if traffic_index_col in df.columns:
		traffic_index = df[traffic_index_col].astype(float).clip(lower=0.0, upper=1.0)
	elif current_speed_col in df.columns and free_flow_col in df.columns:
		traffic_index = df.apply(
			lambda row: calculate_traffic_index(row[current_speed_col], row[free_flow_col]),
			axis=1,
		)
	else:
		raise ValueError(
			f"Cannot extract traffic features because neither '{traffic_index_col}' nor "
			f"'{current_speed_col}'/'{free_flow_col}' are available."
		)

	df[traffic_index_col] = traffic_index

	# Training label must come from DW/Data Mart when available.
	if "congestion_level" in df.columns:
		df["congestion_level"] = pd.to_numeric(df["congestion_level"], errors="coerce")
		df.loc[~df["congestion_level"].between(0, 5, inclusive="both"), "congestion_level"] = np.nan

	if derive_aux_levels:
		df["los_level"] = df[traffic_index_col].apply(classify_los)
		if "congestion_level" not in df.columns:
			df["congestion_level"] = df[traffic_index_col].apply(classify_congestion_level)
	return df
