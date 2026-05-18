import pandas as pd

# Đọc dữ liệu GỐC (trước khi augment) để lấy được dữ liệu Real
data_path = "/workspace/ai-core/data/processed/01_processed_features.parquet"
print(f"Loading {data_path}...")
df = pd.read_parquet(data_path)

def extract_samples():
    print("=== SAMPLES THỰC TẾ (REAL) CLASS 4 & 5 (TỪ TẬP DỮ LIỆU GỐC) ===")
    
    # Tính lại traffic_index và speed_ratio nếu cần
    if 'speed_ratio' not in df.columns:
        df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh']).clip(0, 1.5).fillna(1.0)
    if 'traffic_index' not in df.columns:
        df['traffic_index'] = (1.0 - df['current_speed_kmh'] / df['free_flow_speed_kmh']).clip(0, 1.5).fillna(0.0)
        
    # Tìm các segment_key có chứa Class 4 hoặc 5
    for cls in [4, 5]:
        print(f"\n{'='*80}")
        print(f" TÌM KIẾM MẪU CLASS {cls} (REAL)")
        print(f"{'='*80}")
        
        # Tìm các dòng có nhãn tương ứng
        target_rows = df[df['congestion_level'] == cls]
        
        if len(target_rows) == 0:
            print(f"Không tìm thấy mẫu Real nào cho Class {cls}.")
            continue
            
        # Lấy 2 dòng ngẫu nhiên
        sample_rows = target_rows.sample(2, random_state=42)
        
        for i, (_, row) in enumerate(sample_rows.iterrows()):
            seg_key = row['segment_key']
            timestamp = row['timestamp']
            
            print(f"\n--- SAMPLE {i+1} | Segment Key: {seg_key} | Timestamp (Target): {timestamp} ---")
            
            # Lấy toàn bộ dữ liệu của segment này, rồi cắt ra 13 dòng kết thúc tại timestamp này
            seg_data = df[df['segment_key'] == seg_key].sort_values('timestamp')
            
            # Tìm index của dòng target
            target_idx_in_seg = seg_data.index.get_loc(row.name)
            
            # Lấy 12 dòng trước đó + dòng target (tổng 13)
            start_idx = max(0, target_idx_in_seg - 12)
            seq = seg_data.iloc[start_idx : target_idx_in_seg + 1].copy()
            
            # Hiển thị các cột quan trọng
            cols_to_show = ['current_speed_kmh', 'free_flow_speed_kmh', 'speed_ratio', 'traffic_index', 'delay_seconds', 'congestion_level']
            
            # Thêm cột "Timestep"
            num_rows = len(seq)
            seq['Timestep'] = [f"T-{num_rows - 1 - j}" if j < num_rows - 1 else "TARGET (Y)" for j in range(num_rows)]
            seq = seq.set_index('Timestep')
            
            pd.set_option('display.max_columns', None)
            pd.set_option('display.width', 1000)
            print(seq[cols_to_show].to_string(float_format=lambda x: "{:.3f}".format(x)))

if __name__ == "__main__":
    extract_samples()
