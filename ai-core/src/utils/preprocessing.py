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

	def fit(self, df_train: pd.DataFrame):
		self.dynamic_scaler.fit(df_train[self.dynamic_cols])
		self.static_scaler.fit(df_train[self.static_cols])
		return self

	def transform(self, df: pd.DataFrame) -> pd.DataFrame:
		df_scaled = df.copy()
		df_scaled[self.dynamic_cols] = self.dynamic_scaler.transform(df[self.dynamic_cols])
		df_scaled[self.static_cols] = self.static_scaler.transform(df[self.static_cols])
		return df_scaled
