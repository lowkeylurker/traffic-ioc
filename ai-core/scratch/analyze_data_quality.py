import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')

print('=== SPEED OVERLAP BY PERCENTILE ===')
for cls in range(6):
    sub = df[df['congestion_level'] == cls]['current_speed_kmh']
    p10, p50, p90 = sub.quantile([0.10, 0.50, 0.90])
    print(f'Class {cls}: P10={p10:.1f}  P50={p50:.1f}  P90={p90:.1f}  n={len(sub):,}')

print()
print('=== SYNTHETIC DATA QUALITY (Class 4 & 5) ===')
for cls in [4, 5]:
    real = df[(df['congestion_level'] == cls) & (df['synthetic_flag'] == 0)]['current_speed_kmh']
    synth = df[(df['congestion_level'] == cls) & (df['synthetic_flag'] == 1)]['current_speed_kmh']
    print(f'Class {cls} REAL   n={len(real):,}  mean={real.mean():.2f}  max={real.max():.2f}')
    if len(synth) > 0:
        print(f'Class {cls} SYNTH  n={len(synth):,}  mean={synth.mean():.2f}  max={synth.max():.2f}')
    print()

print('=== CLASS 5 speed > 30 kmh (overlap with Class 0/1) ===')
sus = df[(df['congestion_level'] == 5) & (df['current_speed_kmh'] > 30)]
synth_count = (sus['synthetic_flag'] == 1).sum()
print(f'Count={len(sus):,}  Synthetic={synth_count:,}  ({synth_count/max(len(sus),1)*100:.1f}%)')

print()
print('=== CLASS 0 speed < 20 kmh (overlap with congested) ===')
sus0 = df[(df['congestion_level'] == 0) & (df['current_speed_kmh'] < 20)]
print(f'Count={len(sus0):,}  ({len(sus0)/max(len(df[df["congestion_level"]==0]),1)*100:.1f}% of Class 0)')

print()
print('=== TRAFFIC_INDEX BY CLASS ===')
for cls in range(6):
    sub = df[df['congestion_level'] == cls]['traffic_index']
    print(f'Class {cls}: mean={sub.mean():.3f}  std={sub.std():.3f}')

print()
print('=== DELAY_SECONDS BY CLASS ===')
for cls in range(6):
    sub = df[df['congestion_level'] == cls]['delay_seconds']
    print(f'Class {cls}: mean={sub.mean():.1f}  std={sub.std():.1f}  P90={sub.quantile(0.9):.1f}')
