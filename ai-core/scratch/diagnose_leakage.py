import pandas as pd
import numpy as np
from pathlib import Path
import sys

PROJECT_ROOT = Path('/workspace/ai-core')
INPUT_PATH = PROJECT_ROOT / "data" / "processed" / "02_balanced_training_data.parquet"

def diagnose():
    if not INPUT_PATH.exists():
        print(f"❌ Không tìm thấy file: {INPUT_PATH}")
        return

    df = pd.read_parquet(INPUT_PATH)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    # 1. Kiểm tra dải thời gian
    print(f"Dải thời gian: {df['timestamp'].min()} -> {df['timestamp'].max()}")
    
    # 2. Giả lập Split 80/20 Chronological
    # Tìm mốc thời gian chia (dựa trên windows)
    # Lấy nhãn cuối mỗi segment
    window_df = df.groupby('segment_key').agg({'timestamp': 'last', 'congestion_level': 'last'})
    window_df = window_df.sort_values('timestamp')
    
    split_idx = int(len(window_df) * 0.8)
    split_time = window_df.iloc[split_idx]['timestamp']
    
    train_windows = window_df.iloc[:split_idx]
    val_windows = window_df.iloc[split_idx:]
    
    print(f"\n--- PHÂN BỔ LỚP THEO WINDOWS ---")
    print(f"Mốc chia thời gian (80%): {split_time}")
    
    train_dist = train_windows['congestion_level'].value_counts().sort_index()
    val_dist = val_windows['congestion_level'].value_counts().sort_index()
    
    dist_df = pd.DataFrame({
        'Train Count': train_dist,
        'Val Count': val_dist
    }).fillna(0).astype(int)
    dist_df['Train %'] = (dist_df['Train Count'] / dist_df['Train Count'].sum() * 100).round(1)
    dist_df['Val %'] = (dist_df['Val Count'] / dist_df['Val Count'].sum() * 100).round(1)
    
    print(dist_df)

    # 3. Kiểm tra rò rỉ hoặc bất thường về đặc trưng
    print("\n--- KIỂM TRA GIÁ TRỊ TỐC ĐỘ (SPEED) ---")
    train_rows = df[df['timestamp'] <= split_time]
    val_rows = df[df['timestamp'] > split_time]
    
    print(f"Train Speed: Min={train_rows['current_speed_kmh'].min():.2f}, Max={train_rows['current_speed_kmh'].max():.2f}, Mean={train_rows['current_speed_kmh'].mean():.2f}")
    print(f"Val Speed:   Min={val_rows['current_speed_kmh'].min():.2f}, Max={val_rows['current_speed_kmh'].max():.2f}, Mean={val_rows['current_speed_kmh'].mean():.2f}")

if __name__ == "__main__":
    diagnose()
