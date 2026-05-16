"""Generic preprocessing helpers shared across AI-core."""

from __future__ import annotations

import pandas as pd
from sklearn.preprocessing import MinMaxScaler

from src.ml.feature_contract import DYNAMIC_FEATURE_COLS, STATIC_SCALER_FEATURE_COLS


class TrafficScaler:
	def __init__(self):
		self.dynamic_scaler = MinMaxScaler()
		self.static_scaler = MinMaxScaler()
		self.dynamic_cols = DYNAMIC_FEATURE_COLS
		self.static_cols = STATIC_SCALER_FEATURE_COLS

	def _ensure_derived_features(self, df: pd.DataFrame) -> pd.DataFrame:
		"""Tính các features dẫn xuất on-the-fly nếu feature contract yêu cầu nhưng cột chưa có."""
		# 1. speed_ratio = current_speed / free_flow_speed
		if "speed_ratio" in self.dynamic_cols and "speed_ratio" not in df.columns:
			df = df.copy()
			free_flow = df["free_flow_speed_kmh"].replace(0, float("nan"))
			df["speed_ratio"] = (df["current_speed_kmh"] / free_flow).clip(0.0, 1.5).fillna(1.0)

		# 2. speed_ratio_delta = thay đổi speed_ratio giữa 2 bước liên tiếp trong cùng segment
		# Giúp LSTM phân biệt Class 0-3: speed đang tăng (phục hồi) hay giảm (kẹt thêm)
		if "speed_ratio_delta" in self.dynamic_cols and "speed_ratio_delta" not in df.columns:
			if "speed_ratio" not in df.columns:
				free_flow = df["free_flow_speed_kmh"].replace(0, float("nan"))
				df = df.copy()
				df["speed_ratio"] = (df["current_speed_kmh"] / free_flow).clip(0.0, 1.5).fillna(1.0)
			df["speed_ratio_delta"] = (
				df.groupby("segment_key")["speed_ratio"]
				.diff()
				.fillna(0.0)   # Điểm đầu segment không có delta → 0
				.clip(-0.5, 0.5)
			)
		return df

	def fit(self, df_train: pd.DataFrame):
		df_train = self._ensure_derived_features(df_train)
		self.dynamic_scaler.fit(df_train[self.dynamic_cols])
		self.static_scaler.fit(df_train[self.static_cols])
		return self

	def transform(self, df: pd.DataFrame) -> pd.DataFrame:
		df = self._ensure_derived_features(df)
		df_scaled = df.copy()
		df_scaled[self.dynamic_cols] = self.dynamic_scaler.transform(df[self.dynamic_cols])
		df_scaled[self.static_cols] = self.static_scaler.transform(df[self.static_cols])
		return df_scaled
