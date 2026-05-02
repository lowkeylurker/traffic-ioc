import pandas as pd
from pathlib import Path
import sys

PROJECT_ROOT = Path('/workspace/ai-core')
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.rl.data_balance.pipeline import ClassBalanceConfig, build_balanced_dataset_from_path

def test_pipeline_execution():
    INPUT_PATH = PROJECT_ROOT / "data" / "processed" / "01_processed_features.parquet"
    
    print(f"--- TESTING PIPELINE EXECUTION ---")
    print(f"Input: {INPUT_PATH}")
    
    config = ClassBalanceConfig(
        anchor_class=3,
        synthetic_rows_class4=1000, # Small target for test
        synthetic_rows_class5=1000,
        use_ctgan=False # Use jitter for speed in test
    )
    
    try:
        balanced_df, report = build_balanced_dataset_from_path(
            input_path=INPUT_PATH,
            config=config
        )
        print(f"SUCCESS!")
        print(f"Balanced shape: {balanced_df.shape}")
        
        report_dict = report.to_dict()
        print(f"Stage counts: {report_dict.get('stage_counts')}")
        
    except Exception as e:
        print(f"FAILED with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_pipeline_execution()
