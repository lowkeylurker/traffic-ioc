"""Congestion prediction routes (warmstart RL batch inference)."""

from __future__ import annotations

import re
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from src.api.dependencies import get_warmstart_rl_predictor
from src.data_access import get_corridors_by_segment, get_nearest_segments_in_corridor
from src.rl.inference.predictor import RLTrafficPredictor, forecast_for_request
from src.schemas.congestion_rl_schema import (
	CongestionBatchPredictionRequest,
	CongestionBatchPredictionResponse,
	CongestionPredictionItem,
)

router = APIRouter(prefix="/api/v1", tags=["congestion-rl"])

FALLBACK_NEAREST_LIMIT = 8
FALLBACK_MAX_DISTANCE_M = 2000.0


def _extract_level(status_description: str | None) -> int | None:
	if not status_description:
		return None
	match = re.search(r"Mức\s+(\d)", status_description)
	if not match:
		return None
	return int(match.group(1))


def _try_predict_single_segment(
	predictor: RLTrafficPredictor,
	segment_id: int,
	request_time_str: str,
	horizon_minutes: int,
) -> CongestionPredictionItem | None:
	df_segment_result = forecast_for_request(
		predictor=predictor,
		segment_ids=[segment_id],
		request_time=request_time_str,
		resample_minutes=horizon_minutes,
	)
	if not isinstance(df_segment_result, pd.DataFrame) or df_segment_result.empty:
		return None

	row = df_segment_result.iloc[0]
	status_description = str(row.get("Dự báo (15p tới)", ""))
	level = _extract_level(status_description)
	forecast_for_time = pd.to_datetime(row.get("Forecast_For_Time")).to_pydatetime()

	return CongestionPredictionItem(
		segment_id=int(row["Segment_ID"]),
		congestion_level=level,
		status="ok",
		status_description=status_description,
		forecast_for_time=forecast_for_time,
		reason_code="DIRECT",
		model_profile="warmstart",
	)


def _fallback_predict_in_same_corridor(
	predictor: RLTrafficPredictor,
	target_segment_id: int,
	request_time_str: str,
	horizon_minutes: int,
) -> CongestionPredictionItem | None:
	corridor_ids = get_corridors_by_segment(target_segment_id)
	for corridor_id in corridor_ids:
		candidates = get_nearest_segments_in_corridor(
			segment_id=target_segment_id,
			corridor_id=corridor_id,
			limit=FALLBACK_NEAREST_LIMIT,
		)
		for candidate_segment_id, distance_m in candidates:
			if distance_m > FALLBACK_MAX_DISTANCE_M:
				continue

			candidate_item = _try_predict_single_segment(
				predictor=predictor,
				segment_id=candidate_segment_id,
				request_time_str=request_time_str,
				horizon_minutes=horizon_minutes,
			)
			if candidate_item is None:
				continue

			candidate_item.segment_id = target_segment_id
			candidate_item.used_fallback = True
			candidate_item.source_segment_id = candidate_segment_id
			candidate_item.fallback_distance_m = round(float(distance_m), 2)
			candidate_item.reason_code = "FALLBACK_NEAREST"
			return candidate_item

	return None


@router.post("/congestion-prediction/batch", response_model=CongestionBatchPredictionResponse)
def predict_congestion_batch(
	payload: CongestionBatchPredictionRequest,
	predictor: RLTrafficPredictor = Depends(get_warmstart_rl_predictor),
) -> CongestionBatchPredictionResponse:
	segment_ids = list(dict.fromkeys(payload.segment_ids))
	if not segment_ids:
		raise HTTPException(status_code=400, detail="segment_ids must not be empty")
	if any(segment_id <= 0 for segment_id in segment_ids):
		raise HTTPException(status_code=400, detail="segment_ids must be positive integers")

	request_time = payload.request_time or datetime.utcnow()
	request_time_str = request_time.strftime("%Y-%m-%d %H:%M:%S")

	try:
		df_results = forecast_for_request(
			predictor=predictor,
			segment_ids=segment_ids,
			request_time=request_time_str,
			resample_minutes=payload.prediction_horizon_minutes,
		)
	except HTTPException:
		raise
	except Exception as exc:
		raise HTTPException(status_code=500, detail=f"Failed to run warmstart RL inference: {exc}") from exc

	by_segment: dict[int, CongestionPredictionItem] = {}
	if isinstance(df_results, pd.DataFrame) and not df_results.empty:
		for _, row in df_results.iterrows():
			sid = int(row["Segment_ID"])
			status_description = str(row.get("Dự báo (15p tới)", ""))
			level = _extract_level(status_description)
			forecast_for_time = pd.to_datetime(row.get("Forecast_For_Time")).to_pydatetime()

			by_segment[sid] = CongestionPredictionItem(
				segment_id=sid,
				congestion_level=level,
				status="ok",
				status_description=status_description,
				forecast_for_time=forecast_for_time,
				reason_code="DIRECT",
				model_profile="warmstart",
				used_fallback=False,
				source_segment_id=sid,
				fallback_distance_m=0.0,
			)

	items: list[CongestionPredictionItem] = []
	for sid in segment_ids:
		if sid in by_segment:
			items.append(by_segment[sid])
		else:
			fallback_item = _fallback_predict_in_same_corridor(
				predictor=predictor,
				target_segment_id=sid,
				request_time_str=request_time_str,
				horizon_minutes=payload.prediction_horizon_minutes,
			)
			if fallback_item is not None:
				items.append(fallback_item)
				continue

			items.append(
				CongestionPredictionItem(
					segment_id=sid,
					congestion_level=None,
					status="no_data",
					status_description=None,
					forecast_for_time=None,
					reason_code="NO_VALID_WINDOW_OR_FALLBACK",
					model_profile="warmstart",
					used_fallback=False,
					source_segment_id=None,
					fallback_distance_m=None,
				)
			)

	success_count = sum(1 for item in items if item.status == "ok")
	no_data_count = sum(1 for item in items if item.status == "no_data")

	return CongestionBatchPredictionResponse(
		request_time=request_time,
		prediction_horizon_minutes=payload.prediction_horizon_minutes,
		model_profile="warmstart",
		total_segments=len(segment_ids),
		success_count=success_count,
		no_data_count=no_data_count,
		items=items,
	)
