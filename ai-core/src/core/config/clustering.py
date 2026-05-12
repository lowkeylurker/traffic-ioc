"""Clustering settings."""

from __future__ import annotations

from pydantic import BaseModel


class ClusteringSettings(BaseModel):
	algorithm: str
	num_clusters: int
	features: list[str]
	imputation_method: str