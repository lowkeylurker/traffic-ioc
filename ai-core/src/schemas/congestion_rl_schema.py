"""Pydantic schemas for RL congestion prediction endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CongestionPredictionRequest(BaseModel):
	"""Single-segment request kept for backward compatibility."""

	segment_id: int = Field(..., description="Segment cần dự báo")
	request_time: Optional[datetime] = Field(default=None, description="Thời điểm request (ISO 8601)")
	prediction_horizon_minutes: int = Field(default=15, ge=15, le=15)


class CongestionPredictionItem(BaseModel):
	model_config = ConfigDict(protected_namespaces=())

	segment_id: int
	congestion_level: Optional[int] = Field(default=None, ge=0, le=5)
	status: str = Field(default="ok", description="ok | no_data | error")
	status_description: Optional[str] = None
	forecast_for_time: Optional[datetime] = None
	reason_code: str = Field(default="DIRECT")
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
	prediction_horizon_minutes: int = Field(default=15, ge=15, le=15)


class CongestionBatchPredictionResponse(BaseModel):
	model_config = ConfigDict(protected_namespaces=())

	request_time: datetime
	prediction_horizon_minutes: int = 15
	model_profile: str = "warmstart"
	total_segments: int
	success_count: int
	no_data_count: int
	items: list[CongestionPredictionItem]
