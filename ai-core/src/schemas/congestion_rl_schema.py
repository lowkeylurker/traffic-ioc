"""Pydantic schemas for RL congestion prediction endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CongestionPredictionRequest(BaseModel):
	"""Single-segment request kept for backward compatibility."""

	segment_id: int = Field(..., description="Segment cần dự báo")
	request_time: datetime | None = Field(default=None, description="Thời điểm request (ISO 8601)")
	prediction_horizon_minutes: int = Field(default=15, ge=15, le=15)


class CongestionPredictionItem(BaseModel):
	segment_id: int
	congestion_level: int | None = Field(default=None, ge=0, le=5)
	status: str = Field(default="ok", description="ok | no_data | error")
	status_description: str | None = None
	forecast_for_time: datetime | None = None
	reason_code: str = Field(default="DIRECT")
	model_profile: str = Field(default="warmstart")


class CongestionPredictionResponse(BaseModel):
	request_time: datetime
	prediction_horizon_minutes: int = 15
	result: CongestionPredictionItem


class CongestionBatchPredictionRequest(BaseModel):
	segment_ids: list[int] = Field(..., min_length=1, max_length=500)
	request_time: datetime | None = None
	prediction_horizon_minutes: int = Field(default=15, ge=15, le=15)


class CongestionBatchPredictionResponse(BaseModel):
	request_time: datetime
	prediction_horizon_minutes: int = 15
	model_profile: str = "warmstart"
	total_segments: int
	success_count: int
	no_data_count: int
	items: list[CongestionPredictionItem]
