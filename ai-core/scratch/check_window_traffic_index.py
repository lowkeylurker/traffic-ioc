import pandas as pd
import numpy as np

# Đọc dữ liệu
data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
print(f"Loading {data_path}...")
df = pd.read_parquet(data_path)

# Định nghĩa các hàm để tạo window
window_size = 12

def check_window_perfection_traffic_index():
    # Lấy 10% sample như trước
    unique_segs = df['segment_key'].unique()
    np.random.seed(42)
    sampled_segs = np.random.choice(unique_segs, size=int(len(unique_segs) * 0.1), replace=False)
    
    df_subset = df[df['segment_key'].isin(sampled_segs)].copy()
    print(f"Computing window-level statistics on a {len(df_subset)} row subset for 'traffic_index'...")
    
    # Tính mean và std của traffic_index trong cửa sổ 12 bước
    df_subset['window_mean'] = df_subset.groupby('segment_key')['traffic_index'].transform(lambda x: x.rolling(window_size).mean())
    df_subset['window_std'] = df_subset.groupby('segment_key')['traffic_index'].transform(lambda x: x.rolling(window_size).std())
    
    # Bỏ qua các dòng NaN
    valid_windows = df_subset.dropna(subset=['window_mean', 'window_std'])
    
    print("\n=== Phân tích theo traffic_index ===")
    print(f"{'Class':<5} | {'Nguồn':<10} | {'Số lượng':<10} | {'Mean(Traffic Index)':<20} | {'Std(Traffic Index)':<25}")
    print("-" * 85)
    
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
            
            print(f"{cls:<5} | {source_name:<10} | {len(subset):<10} | {avg_window_mean:.3f}                | Mean: {avg_window_std:.4f} (Median: {median_window_std:.4f}) | Tĩnh (<0.01): {perfect_windows_pct:.1f}%")

if __name__ == "__main__":
    check_window_perfection_traffic_index()
