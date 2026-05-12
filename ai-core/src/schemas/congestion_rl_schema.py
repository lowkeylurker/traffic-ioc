"""Pydantic schemas for RL congestion prediction endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from src.ml.feature_contract import NUM_CLASSES


class PredictionStatus(str, Enum):
	OK = "ok"
	NO_DATA = "no_data"
	ERROR = "error"


class PredictionReasonCode(str, Enum):
	DIRECT = "DIRECT"
	FALLBACK_NEAREST = "FALLBACK_NEAREST"
	NO_VALID_WINDOW = "NO_VALID_WINDOW"
	NO_CORRIDOR_MAPPING = "NO_CORRIDOR_MAPPING"
	FALLBACK_NO_CANDIDATE = "FALLBACK_NO_CANDIDATE"
	FALLBACK_DISTANCE_EXCEEDED = "FALLBACK_DISTANCE_EXCEEDED"
	FALLBACK_NO_VALID_WINDOW = "FALLBACK_NO_VALID_WINDOW"


class CongestionPredictionRequest(BaseModel):
	"""Single-segment request kept for backward compatibility."""

	segment_id: int = Field(..., description="Segment cần dự báo")
	request_time: Optional[datetime] = Field(default=None, description="Thời điểm request (ISO 8601)")
	prediction_horizon_minutes: Literal[15, 30] = Field(default=15, description="Only 15 or 30 minutes are allowed")


class CongestionPredictionItem(BaseModel):
	model_config = ConfigDict(protected_namespaces=())

	segment_id: int
	congestion_level: Optional[int] = Field(default=None, ge=0, le=NUM_CLASSES - 1)
	status: PredictionStatus = Field(default=PredictionStatus.OK, description="Prediction status")
	status_description: Optional[str] = None
	forecast_for_time: Optional[datetime] = None
	reason_code: PredictionReasonCode = Field(default=PredictionReasonCode.DIRECT)
	model_profile: str = Field(default="warmstart")
	used_fallback: bool = False
	source_segment_id: Optional[int] = None
	fallback_distance_m: Optional[float] = None


class CongestionPredictionResponse(BaseModel):
	request_time: datetime
	prediction_horizon_minutes: int = 15
	result: CongestionPredictionItem


class CongestionBatchPredictionRequest(BaseModel):
	segment_ids: list[int] = Field(..., min_length=1, max_length=500)
	request_time: Optional[datetime] = None
	prediction_horizon_minutes: Literal[15, 30] = Field(default=15, description="Only 15 or 30 minutes are allowed")


class CongestionBatchPredictionResponse(BaseModel):
	model_config = ConfigDict(protected_namespaces=())

	request_time: datetime
	prediction_horizon_minutes: int = 15
	model_profile: str = "warmstart"
	total_segments: int
	success_count: int
	no_data_count: int
	items: list[CongestionPredictionItem]


class BenchmarkBatchRequest(BaseModel):
	"""Request for batch prediction performance benchmark."""
	batch_size: int = Field(default=100, ge=1, le=500, description="Segment count to benchmark")
	num_runs: int = Field(default=5, ge=1, le=20, description="Number of benchmark runs")
	seed: int = Field(default=42, description="Random seed for reproducible segment selection")
	prediction_horizon_minutes: Literal[15, 30] = Field(default=15, description="Only 15 or 30 minutes are allowed")


class BenchmarkBatchResponse(BaseModel):
	model_config = ConfigDict(protected_namespaces=())

	batch_size: int
	num_runs: int
	total_time_ms: float
	p50_latency_ms: float
	p95_latency_ms: float
	avg_latency_ms: float
	throughput_per_second: float
	success_rate_pct: float
	direct_hit_rate_pct: float
	fallback_hit_rate_pct: float
	no_data_rate_pct: float
	model_profile: str = "warmstart"
	note: Optional[str] = None
