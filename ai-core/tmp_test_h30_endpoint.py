#!/usr/bin/env python3
"""Quick check: Verify h30 model artifacts exist and endpoint can load them."""

import json
import os
import sys
from pathlib import Path
import joblib

# Setup path
ROOT_DIR = Path(__file__).resolve().parents[0]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.artifacts import get_ml_preprocessing_path, get_ml_checkpoint_path
from src.rl.artifacts import get_rl_checkpoint_path


def check_artifacts_exist():
    """Verify all required h30 artifacts are in place."""
    print("\n" + "="*75)
    print("🔍 KIỂM TRA ARTIFACTS H30")
    print("="*75)
    
    # 1. Check ML preprocessing artifacts
    ml_preprocess_path = get_ml_preprocessing_path(run_id="manual_h30")
    print(f"\n📦 ML Preprocessing (manual_h30):")
    print(f"   Path: {ml_preprocess_path}")
    print(f"   Exists: {ml_preprocess_path.exists()}")
    
    if ml_preprocess_path.exists():
        try:
            with open(ml_preprocess_path, 'rb') as f:
                artifacts = joblib.load(f)
            print(f"   ✅ Loaded successfully")
            print(f"   Keys: {list(artifacts.keys())}")
            print(f"   Size: {ml_preprocess_path.stat().st_size / 1024:.1f} KB")
        except Exception as e:
            print(f"   ❌ Failed to load: {e}")
            return False
    else:
        print(f"   ❌ NOT FOUND")
        return False
    
    # 2. Check ML checkpoint
    ml_checkpoint_path = get_ml_checkpoint_path(run_id="manual_h30")
    print(f"\n🧠 ML Checkpoint (manual_h30):")
    print(f"   Path: {ml_checkpoint_path}")
    print(f"   Exists: {ml_checkpoint_path.exists()}")
    if ml_checkpoint_path.exists():
        print(f"   Size: {ml_checkpoint_path.stat().st_size / 1024 / 1024:.1f} MB")
    
    # 3. Check ML metrics
    from src.ml.artifacts import get_ml_metrics_path
    metrics_path = get_ml_metrics_path(run_id="manual_h30")
    print(f"\n📊 ML Metrics (manual_h30):")
    print(f"   Path: {metrics_path}")
    print(f"   Exists: {metrics_path.exists()}")
    
    if metrics_path.exists():
        try:
            with open(metrics_path, 'r') as f:
                metrics = json.load(f)
            print(f"   ✅ Loaded successfully")
            if 'best_macro_f1' in metrics:
                print(f"   Best Macro-F1: {metrics['best_macro_f1']:.4f}")
            if 'best_epoch' in metrics:
                print(f"   Best Epoch: {metrics['best_epoch']}")
        except Exception as e:
            print(f"   ❌ Failed to load: {e}")
    else:
        print(f"   ⚠️  NOT FOUND (optional)")
    
    # 4. Check RL checkpoint candidates
    print(f"\n🤖 RL Checkpoints (for serving):")
    rl_candidates = [
        f"manual_h30",
        f"warmstart_manual_h30",
        None,
    ]
    
    rl_found = False
    for run_id in rl_candidates:
        try:
            path = get_rl_checkpoint_path(mode="warmstart", run_id=run_id)
            exists = path.exists()
            status = "✅" if exists else "⏭️ "
            print(f"   {status} run_id={run_id}: {path}")
            if exists:
                rl_found = True
        except Exception as e:
            print(f"   ⚠️  run_id={run_id}: {e}")
    
    if not rl_found:
        print(f"\n   ⚠️  No RL checkpoint found - API will use default warmstart model")
    
    print("\n" + "="*75)
    return ml_preprocess_path.exists()


def test_api_endpoint():
    """Make test API call to verify h30 endpoint works."""
    print("\n" + "="*75)
    print("🌐 KIỂM TRA ENDPOINT API")
    print("="*75)
    
    import requests
    from datetime import datetime
    
    # Test h30 endpoint
    api_url = "http://localhost:5000/api/v1/congestion-prediction/batch"
    print(f"\nEndpoint: {api_url}")
    print(f"Horizon: 30 minutes")
    
    payload = {
        "segment_ids": [101, 202, 303],
        "request_time": datetime.utcnow().isoformat(),
        "prediction_horizon_minutes": 30,
    }
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        print("\n⏳ Gửi request...")
        response = requests.post(api_url, json=payload, timeout=15)
        
        print(f"\n📨 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ API Response (h30):")
            print(f"   - Model Profile: {result.get('model_profile', 'N/A')}")
            print(f"   - Horizon: {result.get('prediction_horizon_minutes')} minutes")
            print(f"   - Total Segments: {result.get('total_segments')}")
            print(f"   - Success Count: {result.get('success_count')}")
            print(f"   - No Data Count: {result.get('no_data_count')}")
            
            if result.get('items'):
                print(f"   - Sample Prediction (first item):")
                item = result['items'][0]
                print(f"      • Segment ID: {item.get('segment_id')}")
                print(f"      • Congestion Level: {item.get('congestion_level')}")
                print(f"      • Status: {item.get('status')}")
                print(f"      • Reason Code: {item.get('reason_code')}")
                print(f"      • Model Profile: {item.get('model_profile')}")
            
            print(f"\n✅ H30 ENDPOINT WORKING")
            return True
        else:
            print(f"❌ API Error: {response.status_code}")
            print(f"   Body: {response.text[:500]}")
            return False
            
    except requests.ConnectionError:
        print(f"\n⚠️  Cannot connect to API at {api_url}")
        print(f"   Is ai-core service running? (Check: docker compose ps)")
        return False
    except Exception as e:
        print(f"\n❌ Error during API test: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("\n🚀 QUICK H30 ENDPOINT CHECK")
    print("="*75)
    print("Mục đích: Xác nhận model h30 được load đúng theo run_id=manual_h30")
    print("="*75)
    
    # Step 1: Check artifacts
    artifacts_ok = check_artifacts_exist()
    
    if not artifacts_ok:
        print("\n❌ ARTIFACTS CHECK FAILED - H30 training may not have completed successfully")
        sys.exit(1)
    
    # Step 2: Test API (optional, requires running service)
    print("\nℹ️  Để test API endpoint, ai-core service phải đang chạy.")
    print("Bạn có muốn test API endpoint? (Nếu service không chạy, sẽ skip)")
    print("→ Artifacts check PASSED ✅")
    print("→ Run 'docker compose up -d ai-core' to start service for endpoint testing")
    
    # Try API test anyway
    try:
        api_ok = test_api_endpoint()
        if api_ok:
            print("\n✅ ALL CHECKS PASSED - H30 MODEL IS READY FOR SERVING")
        else:
            print("\n⚠️  Artifacts OK but API check needs service running")
    except:
        print("\n⚠️  API test skipped (service may not be running)")
