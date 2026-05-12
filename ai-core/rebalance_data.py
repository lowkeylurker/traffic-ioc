import os
import sys
from pathlib import Path
import pandas as pd
import time

# Thiết lập Project Root
PROJECT_ROOT = Path("/workspace/ai-core")
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from src.rl.data_balance.pipeline import ClassBalanceConfig, build_balanced_dataset_from_path

# 1. ĐỊNH NGHĨA ĐƯỜNG DẪN
INPUT_PATH = PROJECT_ROOT / "data" / "processed" / "01_processed_features.parquet"
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "02_balanced_training_data.parquet"
REPORT_PATH = PROJECT_ROOT / "reports" / "data_balance" / "balance_report_v2.json"
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

# 2. CẤU HÌNH CHIẾN LƯỢC CÂN BẰNG MỚI (DIVERSITY FOCUS)
config = ClassBalanceConfig(
    anchor_class=3,
    majority_multipliers={
        0: 3.0,  # Tăng mạnh để giữ lại nhiều mẫu thực tế
        1: 4.0,  
        2: 3.0   
    },
    majority_cap=200000,          # Nới lỏng giới hạn lên 200k
    synthetic_rows_class4=30000,
    synthetic_rows_class5=22000,
    use_ctgan=True,
    output_path=str(OUTPUT_PATH),
    report_path=str(REPORT_PATH)
)

print(f"🚀 Bắt đầu quy trình TÁI CÂN BẰNG DỮ LIỆU (Mục tiêu đa dạng hóa L0, L1, L2)...")
start_time = time.time()

try:
    balanced_df, report = build_balanced_dataset_from_path(
        input_path=INPUT_PATH,
        config=config
    )
    elapsed = time.time() - start_time
    print(f"\n✅ Hoàn thành trong {elapsed/60:.2f} phút!")
    print(f"📊 Kích thước tập dữ liệu mới: {balanced_df.shape}")
    print(f"💾 Đã lưu tại: {OUTPUT_PATH}")
    
    # In phân bổ cuối cùng
    summary = balanced_df.groupby("segment_key")["congestion_level"].last()
    print("\n--- PHÂN BỔ CỬA SỔ (WINDOWS) MỚI ---")
    print(summary.value_counts().sort_index())

except Exception as e:
    print(f"❌ Lỗi: {e}")
