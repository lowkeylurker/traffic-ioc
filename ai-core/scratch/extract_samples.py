import pandas as pd

# Đọc dữ liệu
data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
print(f"Loading {data_path}...")
df = pd.read_parquet(data_path)

def extract_samples():
    print("=== SAMPLES THỰC TẾ (REAL) CLASS 4 & 5 ===")
    
    # Lọc dữ liệu Real
    df_real = df[df['synthetic_flag'] == 0].copy()
    
    # Lấy nhãn cuối cùng của mỗi segment (đây chính là nhãn mục tiêu Y)
    # Trong file 02_, mỗi segment_key có chính xác 13 dòng. Dòng cuối cùng là target.
    last_rows = df_real.groupby('segment_key').tail(1)
    
    for cls in [4, 5]:
        print(f"\n{'='*80}")
        print(f" TÌM KIẾM MẪU CLASS {cls} (REAL)")
        print(f"{'='*80}")
        
        # Tìm các segment_key kết thúc bằng Class này
        target_segs = last_rows[last_rows['congestion_level'] == cls]['segment_key'].unique()
        
        if len(target_segs) == 0:
            print(f"Không tìm thấy mẫu Real nào cho Class {cls}.")
            continue
            
        # Lấy 2 sample ngẫu nhiên
        sample_segs = target_segs[:2]
        
        for i, seg in enumerate(sample_segs):
            print(f"\n--- SAMPLE {i+1} | Segment Key: {seg} ---")
            
            # Lấy toàn bộ 13 dòng của segment này
            seq = df_real[df_real['segment_key'] == seg].copy()
            
            # Tính lại speed_ratio nếu cần để dễ nhìn
            if 'speed_ratio' not in seq.columns:
                 seq['speed_ratio'] = (seq['current_speed_kmh'] / seq['free_flow_speed_kmh']).clip(0, 1.5).fillna(1.0)
            
            # Hiển thị các cột quan trọng
            cols_to_show = ['current_speed_kmh', 'free_flow_speed_kmh', 'speed_ratio', 'traffic_index', 'delay_seconds', 'congestion_level']
            
            # In ra DataFrame có format đẹp
            # Thêm cột "Timestep" từ -12 đến 0 (0 là target)
            seq['Timestep'] = [f"T-{12-j}" if j < 12 else "TARGET (Y)" for j in range(len(seq))]
            seq = seq.set_index('Timestep')
            
            pd.set_option('display.max_columns', None)
            pd.set_option('display.width', 1000)
            print(seq[cols_to_show].to_string(float_format=lambda x: "{:.3f}".format(x)))

if __name__ == "__main__":
    extract_samples()
