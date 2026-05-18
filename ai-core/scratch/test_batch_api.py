import asyncio
from datetime import datetime
from src.api.routes.congestion import predict_congestion_batch
from src.schemas.congestion_rl_schema import CongestionBatchPredictionRequest
from src.api.dependencies import _build_warmstart_predictor
from src.data_access import get_benchmark_segment_pool
import time
import os

def test_api():
    print("Loading predictor...")
    os.environ["AI_MODELS_DIR"] = "/workspace/ai-core/models"
    predictor = _build_warmstart_predictor(15)
    
    # Get some segments
    pool = get_benchmark_segment_pool(limit=100)
    if not pool:
        print("No segments found in pool.")
        return
        
    segment_ids = pool[:70]
    
    request_time = "2026-05-18T10:30:00"
    payload = CongestionBatchPredictionRequest(
        segment_ids=segment_ids,
        request_time=request_time,
        prediction_horizon_minutes=15
    )
    
    print(f"Running API endpoint for {len(segment_ids)} segments at {request_time}...")
    start_time = time.time()
    
    response = predict_congestion_batch(
        payload=payload,
        predictor=predictor
    )
    
    end_time = time.time()
    print(f"\nDone! API took {end_time - start_time:.4f} seconds.")
    print(f"Success: {response.success_count}, No Data: {response.no_data_count}")

if __name__ == "__main__":
    test_api()
