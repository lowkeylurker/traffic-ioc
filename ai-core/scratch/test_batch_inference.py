import asyncio
from datetime import datetime
from src.rl.inference.predictor import RLTrafficPredictor, forecast_for_request
from src.api.dependencies import _build_warmstart_predictor
from src.data_access import get_benchmark_segment_pool
import time
import os

def test_batch():
    print("Loading predictor...")
    os.environ["AI_MODELS_DIR"] = "/workspace/ai-core/models"
    predictor = _build_warmstart_predictor(15)
    
    # Get some segments
    pool = get_benchmark_segment_pool(limit=100)
    if len(pool) < 66:
        print("Not enough segments for a 66-segment test.")
        return
        
    segment_ids = pool[:66]
    
    request_time = "2026-05-18 10:30:00"
    
    print(f"Running inference for 66 segments at {request_time}...")
    start_time = time.time()
    
    df_results = forecast_for_request(
        predictor=predictor,
        segment_ids=segment_ids,
        request_time=request_time,
        lookback_steps=12,
        resample_minutes=15
    )
    
    end_time = time.time()
    print(f"\nDone! Inference took {end_time - start_time:.4f} seconds.")
    print(df_results.head())

if __name__ == "__main__":
    test_batch()
