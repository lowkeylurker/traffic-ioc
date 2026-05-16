import pandas as pd
import numpy as np

# Load balanced data
data_path = "/workspace/ai-core/data/processed/02_balanced_training_data.parquet"
df = pd.read_parquet(data_path)

# Calculate speed_ratio if not present
if 'speed_ratio' not in df.columns:
    df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh']).clip(0, 1.5).fillna(1.0)

print("=== Phân tích Độ Dễ (Separability) của các Class ===")
for cls in range(6):
    df_cls = df[df['congestion_level'] == cls]
    print(f"\nClass {cls} (Tổng: {len(df_cls)} dòng):")
    print(f"  Real data: {len(df_cls[df_cls['synthetic_flag'] == 0])}")
    print(f"  Synthetic data: {len(df_cls[df_cls['synthetic_flag'] == 1])}")
    print(f"  Speed Ratio (mean ± std): {df_cls['speed_ratio'].mean():.3f} ± {df_cls['speed_ratio'].std():.3f}")
    if 'delay_seconds' in df_cls.columns:
        print(f"  Delay Seconds (mean ± std): {df_cls['delay_seconds'].mean():.1f} ± {df_cls['delay_seconds'].std():.1f}")
