import os
import sys
from pathlib import Path

# Setup environment
cwd = Path.cwd().resolve()
PROJECT_ROOT = next((p for p in [cwd] + list(cwd.parents) if (p / 'src').exists()), cwd)
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

import torch
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_global_fallback_logic():
    print("🔍 Testing Global Spatial Fallback for unmapped segment...")
    
    # ID này chúng ta biết chắc chắn là không có Corridor Mapping
    ORPHAN_SEGMENT_ID = 17856745219128310
    
    payload = {
        "segment_ids": [ORPHAN_SEGMENT_ID],
        "request_time": "2026-04-15T09:30:00",
        "prediction_horizon_minutes": 15
    }
    
    response = client.post("/api/v1/congestion-prediction/batch", json=payload)
    
    print(f"HTTP Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        item = data["items"][0]
        print(f"Result Status: {item['status']}")
        print(f"Reason Code: {item['reason_code']}")
        
        if item['reason_code'] == "FALLBACK_GLOBAL_NEAREST":
            print("✅ SUCCESS: Global Fallback triggered correctly!")
        elif item['status'] == "ok":
            print("✅ SUCCESS: Found prediction via spatial neighbor.")
        else:
            print(f"ℹ️ Result: {item['status']} (Note: may be no_data if no neighbors have data)")
    else:
        print(f"❌ FAILED: Received {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_global_fallback_logic()
