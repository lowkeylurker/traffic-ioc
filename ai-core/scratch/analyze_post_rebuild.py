import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')

print("=== 1. PHÂN PHỐI DỮ LIỆU SAU REBUILD ===")
total = len(df)
for cls in range(6):
    sub = df[df['congestion_level'] == cls]
    real = (sub['synthetic_flag'] == 0).sum()
    synth = (sub['synthetic_flag'] == 1).sum()
    print(f"Class {cls}: Total={len(sub):,} | Real={real:,} ({real/len(sub)*100:.0f}%) | Synth={synth:,} ({synth/len(sub)*100:.0f}%)")

print()
print("=== 2. SPEED_RATIO THEO CLASS (sau rebuild) ===")
df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh'].replace(0, np.nan)).clip(0.0, 1.5).fillna(1.0)
for cls in range(6):
    sub = df[df['congestion_level'] == cls]['speed_ratio']
    print(f"Class {cls}: P10={sub.quantile(0.10):.3f} | P50={sub.quantile(0.50):.3f} | P90={sub.quantile(0.90):.3f} | mean={sub.mean():.3f}")

print()
print("=== 3. OVERLAP PHÂN TÍCH: % SPEED_RATIO giao thoa giữa các lớp kề nhau ===")
pairs = [(0,1), (1,2), (2,3), (3,4)]
for lo, hi in pairs:
    sub_lo = df[df['congestion_level'] == lo]['speed_ratio']
    sub_hi = df[df['congestion_level'] == hi]['speed_ratio']
    lo_p10, lo_p90 = sub_lo.quantile(0.10), sub_lo.quantile(0.90)
    hi_p10, hi_p90 = sub_hi.quantile(0.10), sub_hi.quantile(0.90)
    overlap_min = max(lo_p10, hi_p10)
    overlap_max = min(lo_p90, hi_p90)
    overlap_range = max(0, overlap_max - overlap_min)
    lo_range = lo_p90 - lo_p10
    hi_range = hi_p90 - hi_p10
    overlap_pct_lo = overlap_range / lo_range * 100 if lo_range > 0 else 0
    overlap_pct_hi = overlap_range / hi_range * 100 if hi_range > 0 else 0
    print(f"Class {lo} ↔ Class {hi}: Overlap range [{overlap_min:.3f}, {overlap_max:.3f}] | "
          f"Class{lo}: {overlap_pct_lo:.0f}% bị overlap | Class{hi}: {overlap_pct_hi:.0f}% bị overlap")

print()
print("=== 4. TRAFFIC_INDEX THEO CLASS (kiểm tra nhất quán với speed_ratio) ===")
for cls in range(6):
    sub = df[df['congestion_level'] == cls]
    sr = sub['speed_ratio'].mean()
    ti = sub['traffic_index'].mean()
    expected_ti = 1 - sr
    diff = abs(ti - expected_ti)
    flag = "❌" if diff > 0.05 else "✅"
    print(f"Class {cls}: speed_ratio={sr:.3f} | traffic_index={ti:.3f} | expected(1-sr)={expected_ti:.3f} | diff={diff:.3f} {flag}")

print()
print("=== 5. BOUNDARY GIỮA CLASS 2-3: Bao nhiêu mẫu Class 2 có speed thấp hơn median Class 3? ===")
median_c3_speed = df[df['congestion_level'] == 3]['current_speed_kmh'].median()
ambiguous_c2 = df[(df['congestion_level'] == 2) & (df['current_speed_kmh'] <= median_c3_speed)]
ambiguous_c1 = df[(df['congestion_level'] == 1) & (df['current_speed_kmh'] <= df[df['congestion_level'] == 2]['current_speed_kmh'].median())]
print(f"Median speed Class 3: {median_c3_speed:.1f} km/h")
print(f"Class 2 samples with speed <= median_C3: {len(ambiguous_c2):,} ({len(ambiguous_c2)/len(df[df['congestion_level']==2])*100:.1f}%)")
median_c2_speed = df[df['congestion_level'] == 2]['current_speed_kmh'].median()
print(f"Median speed Class 2: {median_c2_speed:.1f} km/h")
print(f"Class 1 samples with speed <= median_C2: {len(ambiguous_c1):,} ({len(ambiguous_c1)/len(df[df['congestion_level']==1])*100:.1f}%)")
