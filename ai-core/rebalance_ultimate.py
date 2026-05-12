import os
import sys
from pathlib import Path
import pandas as pd
import time

# Project Root
PROJECT_ROOT = Path("/workspace/ai-core")
sys.path.insert(0, str(PROJECT_ROOT))
os.chdir(PROJECT_ROOT)

from src.rl.data_balance.pipeline import ClassBalanceConfig, build_balanced_dataset_from_path

config = ClassBalanceConfig(
    anchor_class=3,
    majority_multipliers={0: 4.0, 1: 5.0, 2: 4.0},
    majority_cap=250000,
    synthetic_rows_class4=30000,
    synthetic_rows_class5=22000,
    use_ctgan=True,
    output_path=str(PROJECT_ROOT / "data" / "processed" / "02_balanced_training_data.parquet"),
    report_path=str(PROJECT_ROOT / "reports" / "data_balance" / "balance_report_ultimate.json")
)

print("🚀 Đang thực hiện TÁI CÂN BẰNG ULTIMATE (50% Smart + 50% Random)...")
start = time.time()
df, _ = build_balanced_dataset_from_path(PROJECT_ROOT / "data" / "processed" / "01_processed_features.parquet", config)
print(f"✅ Xong! Kích thước: {df.shape}. Thời gian: {(time.time()-start)/60:.2f} phút.")
summary = df.groupby("segment_key")["congestion_level"].last()
print("\n--- PHÂN BỔ CỬA SỔ MỚI ---")
print(summary.value_counts().sort_index())
