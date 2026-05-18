import pandas as pd
import numpy as np

# Đọc dữ liệu
data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
print(f"Loading {data_path}...")
df = pd.read_parquet(data_path)

if 'speed_ratio' not in df.columns:
    df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh']).clip(0, 1.5).fillna(1.0)

# Định nghĩa các hàm để tạo window
window_size = 12

def check_window_perfection():
    # Để tính toán nhanh, ta lấy một subset nhỏ các segment (ví dụ 10% số segment)
    unique_segs = df['segment_key'].unique()
    np.random.seed(42)
    sampled_segs = np.random.choice(unique_segs, size=int(len(unique_segs) * 0.1), replace=False)
    
    df_subset = df[df['segment_key'].isin(sampled_segs)].copy()
    print(f"Computing window-level statistics on a {len(df_subset)} row subset...")
    
    # Tính mean và std của speed_ratio trong cửa sổ 12 bước
    df_subset['window_mean'] = df_subset.groupby('segment_key')['speed_ratio'].transform(lambda x: x.rolling(window_size).mean())
    df_subset['window_std'] = df_subset.groupby('segment_key')['speed_ratio'].transform(lambda x: x.rolling(window_size).std())
    
    # Bỏ qua các dòng NaN
    valid_windows = df_subset.dropna(subset=['window_mean', 'window_std'])
    
    print("\n=== Phân tích Độ 'Hoàn hảo' của Windows theo Class ===")
    print("Một window 'hoàn hảo' thường có độ lệch chuẩn (std) rất thấp (dữ liệu tĩnh/nhân tạo)")
    print(f"{'Class':<5} | {'Nguồn':<10} | {'Số lượng':<10} | {'Mean(SpeedRatio)':<16} | {'Std(SpeedRatio) - (Biến động trong window)':<25}")
    print("-" * 80)
    
    for cls in range(6):
        for is_synthetic in [0, 1]:
            subset = valid_windows[(valid_windows['congestion_level'] == cls) & (valid_windows['synthetic_flag'] == is_synthetic)]
            if len(subset) == 0:
                continue
                
            source_name = "Real" if is_synthetic == 0 else "Synthetic"
            
            avg_window_mean = subset['window_mean'].mean()
            avg_window_std = subset['window_std'].mean()
            median_window_std = subset['window_std'].median()
            
            # Tính % window có độ biến động siêu thấp (<0.01)
            perfect_windows_pct = (subset['window_std'] < 0.01).mean() * 100
            
            print(f"{cls:<5} | {source_name:<10} | {len(subset):<10} | {avg_window_mean:.3f}          | Mean: {avg_window_std:.4f} (Median: {median_window_std:.4f}) | Tĩnh (<0.01): {perfect_windows_pct:.1f}%")

if __name__ == "__main__":
    check_window_perfection()
