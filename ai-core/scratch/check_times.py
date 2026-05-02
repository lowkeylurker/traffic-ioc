import pandas as pd
from pathlib import Path

INPUT_PATH = Path("/workspace/ai-core/data/processed/02_balanced_training_data.parquet")

def check_time_range():
    if not INPUT_PATH.exists():
        print("❌ File không tồn tại")
        return

    df = pd.read_parquet(INPUT_PATH, columns=['timestamp', 'congestion_level'])
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    print(f"Toàn bộ dải thời gian: {df['timestamp'].min()} -> {df['timestamp'].max()}")
    
    for cls in range(6):
        cls_df = df[df['congestion_level'] == cls]
        if not cls_df.empty:
            print(f"Lớp {cls}: {cls_df['timestamp'].min()} -> {cls_df['timestamp'].max()} (Count: {len(cls_df)})")
        else:
            print(f"Lớp {cls}: KHÔNG CÓ DỮ LIỆU")

if __name__ == "__main__":
    check_time_range()
