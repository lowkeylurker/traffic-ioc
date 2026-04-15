"""Congestion prediction routes (warmstart RL batch inference)."""

from __future__ import annotations

import random
import re
import statistics
import time
from datetime import datetime
from typing import Optional, Tuple

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from src.api.dependencies import get_warmstart_rl_predictor
from src.data_access import (
	get_benchmark_segment_pool,
	get_corridors_by_segment,
	get_nearest_segments_in_corridor,
)
from src.rl.inference.predictor import RLTrafficPredictor, forecast_for_request
from src.schemas.congestion_rl_schema import (
	BenchmarkBatchRequest,
	BenchmarkBatchResponse,
	CongestionBatchPredictionRequest,
	CongestionBatchPredictionResponse,
	CongestionPredictionItem,
)

router = APIRouter(prefix="/api/v1", tags=["congestion-rl"])

FALLBACK_NEAREST_LIMIT = 8
FALLBACK_MAX_DISTANCE_M = 2000.0

REASON_DIRECT = "DIRECT"
REASON_FALLBACK_NEAREST = "FALLBACK_NEAREST"
REASON_NO_VALID_WINDOW = "NO_VALID_WINDOW"
REASON_NO_CORRIDOR_MAPPING = "NO_CORRIDOR_MAPPING"
REASON_FALLBACK_NO_CANDIDATE = "FALLBACK_NO_CANDIDATE"
REASON_FALLBACK_DISTANCE_EXCEEDED = "FALLBACK_DISTANCE_EXCEEDED"
REASON_FALLBACK_NO_VALID_WINDOW = "FALLBACK_NO_VALID_WINDOW"


SegmentPredictCache = dict[tuple[int, str, int], Optional[CongestionPredictionItem]]
CorridorCache = dict[int, list[int]]
CandidateCache = dict[tuple[int, int, int], list[tuple[int, float]]]


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
	predict_cache: Optional[SegmentPredictCache] = None,
) -> Optional[CongestionPredictionItem]:
	cache_key = (segment_id, request_time_str, horizon_minutes)
	if predict_cache is not None and cache_key in predict_cache:
		cached = predict_cache[cache_key]
		return cached.model_copy(deep=True) if cached is not None else None

	df_segment_result = forecast_for_request(
		predictor=predictor,
		segment_ids=[segment_id],
		request_time=request_time_str,
		resample_minutes=horizon_minutes,
	)
	if not isinstance(df_segment_result, pd.DataFrame) or df_segment_result.empty:
		if predict_cache is not None:
			predict_cache[cache_key] = None
		return None

	row = df_segment_result.iloc[0]
	status_description = str(row.get("Dự báo (15p tới)", ""))
	level = _extract_level(status_description)
	forecast_for_time = pd.to_datetime(row.get("Forecast_For_Time")).to_pydatetime()

	result = CongestionPredictionItem(
		segment_id=int(row["Segment_ID"]),
		congestion_level=level,
		status="ok",
		status_description=status_description,
		forecast_for_time=forecast_for_time,
		reason_code=REASON_DIRECT,
		model_profile="warmstart",
	)
	if predict_cache is not None:
		predict_cache[cache_key] = result
	return result.model_copy(deep=True)


def _fallback_predict_in_same_corridor(
	predictor: RLTrafficPredictor,
	target_segment_id: int,
	request_time_str: str,
	horizon_minutes: int,
	corridor_cache: CorridorCache,
	candidate_cache: CandidateCache,
	predict_cache: SegmentPredictCache,
) -> Tuple[Optional[CongestionPredictionItem], str]:
	corridor_ids = corridor_cache.get(target_segment_id)
	if corridor_ids is None:
		corridor_ids = get_corridors_by_segment(target_segment_id)
		corridor_cache[target_segment_id] = corridor_ids
	if not corridor_ids:
		return None, REASON_NO_CORRIDOR_MAPPING

	found_any_candidate = False
	found_candidate_within_distance = False
	for corridor_id in corridor_ids:
		cache_key = (target_segment_id, corridor_id, FALLBACK_NEAREST_LIMIT)
		candidates = candidate_cache.get(cache_key)
		if candidates is None:
			candidates = get_nearest_segments_in_corridor(
				segment_id=target_segment_id,
				corridor_id=corridor_id,
				limit=FALLBACK_NEAREST_LIMIT,
			)
			candidate_cache[cache_key] = candidates
		if candidates:
			found_any_candidate = True
		for candidate_segment_id, distance_m in candidates:
			if distance_m > FALLBACK_MAX_DISTANCE_M:
				continue

			found_candidate_within_distance = True

			candidate_item = _try_predict_single_segment(
				predictor=predictor,
				segment_id=candidate_segment_id,
				request_time_str=request_time_str,
				horizon_minutes=horizon_minutes,
				predict_cache=predict_cache,
			)
			if candidate_item is None:
				continue

			candidate_item.segment_id = target_segment_id
			candidate_item.used_fallback = True
			candidate_item.source_segment_id = candidate_segment_id
			candidate_item.fallback_distance_m = round(float(distance_m), 2)
			candidate_item.reason_code = REASON_FALLBACK_NEAREST
			return candidate_item, REASON_FALLBACK_NEAREST

	if found_any_candidate and not found_candidate_within_distance:
		return None, REASON_FALLBACK_DISTANCE_EXCEEDED
	if found_candidate_within_distance:
		return None, REASON_FALLBACK_NO_VALID_WINDOW
	return None, REASON_FALLBACK_NO_CANDIDATE


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
	corridor_cache: CorridorCache = {}
	candidate_cache: CandidateCache = {}
	predict_cache: SegmentPredictCache = {}
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
				reason_code=REASON_DIRECT,
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
			fallback_item, fallback_reason = _fallback_predict_in_same_corridor(
				predictor=predictor,
				target_segment_id=sid,
				request_time_str=request_time_str,
				horizon_minutes=payload.prediction_horizon_minutes,
				corridor_cache=corridor_cache,
				candidate_cache=candidate_cache,
				predict_cache=predict_cache,
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
					reason_code=fallback_reason or REASON_NO_VALID_WINDOW,
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


@router.get("/congestion-prediction/debug-fallback")
def debug_fallback_candidates(
	segment_id: int,
	request_time: Optional[datetime] = None,
	prediction_horizon_minutes: int = 15,
	limit: int = 8,
	predictor: RLTrafficPredictor = Depends(get_warmstart_rl_predictor),
) -> dict:
	if segment_id <= 0:
		raise HTTPException(status_code=400, detail="segment_id must be a positive integer")
	if prediction_horizon_minutes != 15:
		raise HTTPException(status_code=400, detail="prediction_horizon_minutes must be 15")
	if limit <= 0 or limit > 30:
		raise HTTPException(status_code=400, detail="limit must be between 1 and 30")

	request_dt = request_time or datetime.utcnow()
	request_time_str = request_dt.strftime("%Y-%m-%d %H:%M:%S")
	predict_cache: SegmentPredictCache = {}

	direct_item = _try_predict_single_segment(
		predictor=predictor,
		segment_id=segment_id,
		request_time_str=request_time_str,
		horizon_minutes=prediction_horizon_minutes,
		predict_cache=predict_cache,
	)

	corridor_ids = get_corridors_by_segment(segment_id)
	candidate_debug_rows: list[dict] = []

	for corridor_id in corridor_ids:
		candidates = get_nearest_segments_in_corridor(segment_id=segment_id, corridor_id=corridor_id, limit=limit)
		for candidate_segment_id, distance_m in candidates:
			within_distance = distance_m <= FALLBACK_MAX_DISTANCE_M
			candidate_item = None
			candidate_reason = REASON_FALLBACK_DISTANCE_EXCEEDED
			if within_distance:
				candidate_item = _try_predict_single_segment(
					predictor=predictor,
					segment_id=candidate_segment_id,
					request_time_str=request_time_str,
					horizon_minutes=prediction_horizon_minutes,
					predict_cache=predict_cache,
				)
				candidate_reason = REASON_FALLBACK_NEAREST if candidate_item else REASON_FALLBACK_NO_VALID_WINDOW

			candidate_debug_rows.append(
				{
					"corridor_id": corridor_id,
					"candidate_segment_id": candidate_segment_id,
					"distance_m": round(float(distance_m), 2),
					"within_distance_threshold": bool(within_distance),
					"probe_status": "ok" if candidate_item else "no_data",
					"probe_reason": candidate_reason,
				}
			)

	if direct_item is not None:
		overall_reason = REASON_DIRECT
	elif not corridor_ids:
		overall_reason = REASON_NO_CORRIDOR_MAPPING
	elif not candidate_debug_rows:
		overall_reason = REASON_FALLBACK_NO_CANDIDATE
	elif all(not row["within_distance_threshold"] for row in candidate_debug_rows):
		overall_reason = REASON_FALLBACK_DISTANCE_EXCEEDED
	else:
		overall_reason = REASON_FALLBACK_NO_VALID_WINDOW

	return {
		"segment_id": segment_id,
		"request_time": request_dt,
		"prediction_horizon_minutes": prediction_horizon_minutes,
		"direct_prediction_available": bool(direct_item is not None),
		"overall_reason": overall_reason,
		"corridor_ids": corridor_ids,
		"fallback_distance_threshold_m": FALLBACK_MAX_DISTANCE_M,
		"candidates": candidate_debug_rows,
	}


@router.post("/congestion-prediction/benchmark", response_model=BenchmarkBatchResponse)
def benchmark_batch_prediction(
	payload: BenchmarkBatchRequest,
	predictor: RLTrafficPredictor = Depends(get_warmstart_rl_predictor),
) -> BenchmarkBatchResponse:
	"""Benchmark batch prediction performance.
	
	Samples real segment IDs from warehouse and runs multiple batch predictions to measure latency metrics.
	"""
	if payload.batch_size <= 0 or payload.batch_size > 500:
		raise HTTPException(status_code=400, detail="batch_size must be between 1 and 500")
	if payload.num_runs <= 0 or payload.num_runs > 20:
		raise HTTPException(status_code=400, detail="num_runs must be between 1 and 20")

	# Build benchmark batch from real warehouse segment pool (production-like)
	segment_pool = get_benchmark_segment_pool(limit=max(5000, payload.batch_size))
	if not segment_pool:
		raise HTTPException(status_code=503, detail="No warehouse segment pool available for benchmark")

	rng = random.Random(payload.seed)
	if len(segment_pool) >= payload.batch_size:
		segment_ids = rng.sample(segment_pool, payload.batch_size)
	else:
		segment_ids = [rng.choice(segment_pool) for _ in range(payload.batch_size)]
	
	request_time = datetime.utcnow()

	latencies_ms: list[float] = []
	success_count = 0
	direct_count = 0
	fallback_count = 0
	no_data_count = 0
	total_runs = 0

	start_total = time.time()
	for run_idx in range(payload.num_runs):
		try:
			start_run = time.time()
			
			response = predict_congestion_batch(
				payload=CongestionBatchPredictionRequest(
					segment_ids=segment_ids,
					request_time=request_time,
					prediction_horizon_minutes=payload.prediction_horizon_minutes,
				),
				predictor=predictor,
			)
			
			end_run = time.time()
			latency_ms = (end_run - start_run) * 1000.0
			latencies_ms.append(latency_ms)
			success_count += response.success_count
			direct_count += sum(1 for item in response.items if item.reason_code == REASON_DIRECT and item.status == "ok")
			fallback_count += sum(1 for item in response.items if item.used_fallback and item.status == "ok")
			no_data_count += response.no_data_count
			total_runs += 1

		except Exception:
			# Run failed, but continue with other runs
			continue

	end_total = time.time()
	total_time_ms = (end_total - start_total) * 1000.0

	if not latencies_ms:
		raise HTTPException(status_code=500, detail="All benchmark runs failed")

	# Calculate statistics
	p50_latency = statistics.median(latencies_ms)
	if len(latencies_ms) >= 2:
		p95_latency = statistics.quantiles(latencies_ms, n=20)[18]  # 95th percentile
	else:
		p95_latency = latencies_ms[0]
	
	avg_latency = statistics.mean(latencies_ms)
	throughput = (payload.batch_size * total_runs) / (total_time_ms / 1000.0)
	total_predictions = payload.batch_size * total_runs
	success_rate = (success_count / total_predictions) * 100.0 if total_predictions > 0 else 0.0
	direct_hit_rate = (direct_count / total_predictions) * 100.0 if total_predictions > 0 else 0.0
	fallback_hit_rate = (fallback_count / total_predictions) * 100.0 if total_predictions > 0 else 0.0
	no_data_rate = (no_data_count / total_predictions) * 100.0 if total_predictions > 0 else 0.0

	note = None
	if total_runs < payload.num_runs:
		note = f"Completed {total_runs}/{payload.num_runs} runs due to errors"

	return BenchmarkBatchResponse(
		batch_size=payload.batch_size,
		num_runs=total_runs,
		total_time_ms=round(total_time_ms, 2),
		p50_latency_ms=round(p50_latency, 2),
		p95_latency_ms=round(p95_latency, 2),
		avg_latency_ms=round(avg_latency, 2),
		throughput_per_second=round(throughput, 2),
		success_rate_pct=round(success_rate, 2),
		direct_hit_rate_pct=round(direct_hit_rate, 2),
		fallback_hit_rate_pct=round(fallback_hit_rate, 2),
		no_data_rate_pct=round(no_data_rate, 2),
		model_profile="warmstart",
		note=note,
	)
