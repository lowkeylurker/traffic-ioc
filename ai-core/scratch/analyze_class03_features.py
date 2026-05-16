import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')

# Tính derived features như model sẽ dùng
df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh'].replace(0, np.nan)).clip(0.0, 1.5).fillna(1.0)

# Chỉ xét Class 0-3 (REAL data chủ yếu)
df03 = df[df['congestion_level'] <= 3].copy()

# Features model đang dùng
DYNAMIC = ['speed_ratio', 'traffic_index', 'delay_seconds']
STATIC   = ['time_sin', 'time_cos', 'is_peak_hour', 'is_weekend']
ALL_FEATURES = DYNAMIC + STATIC

print("=" * 90)
print("PHÂN TÍCH FEATURES CHO CLASS 0-3 — TÌM NGUỒN GÂY NHIỄU")
print("=" * 90)

print("\n1. THỐNG KÊ CƠ BẢN THEO CLASS (REAL DATA ONLY)")
print("-" * 90)
df03_real = df03[df03['synthetic_flag'] == 0]
for feat in ALL_FEATURES:
    print(f"\n  [{feat}]")
    for cls in range(4):
        sub = df03_real[df03_real['congestion_level'] == cls][feat]
        p10, p25, p50, p75, p90 = sub.quantile([0.10, 0.25, 0.50, 0.75, 0.90])
        print(f"    Class {cls}: P10={p10:7.3f} | P25={p25:7.3f} | P50={p50:7.3f} | P75={p75:7.3f} | P90={p90:7.3f}")

print("\n\n2. OVERLAP VÙNG 10-90 PERCENTILE GIỮA CÁC CLASS KỀ NHAU")
print("-" * 90)
for feat in ALL_FEATURES:
    print(f"\n  [{feat}]")
    for lo, hi in [(0,1), (1,2), (2,3)]:
        sub_lo = df03_real[df03_real['congestion_level'] == lo][feat]
        sub_hi = df03_real[df03_real['congestion_level'] == hi][feat]
        lo_p10, lo_p90 = sub_lo.quantile(0.10), sub_lo.quantile(0.90)
        hi_p10, hi_p90 = sub_hi.quantile(0.10), sub_hi.quantile(0.90)
        overlap_min = max(lo_p10, hi_p10)
        overlap_max = min(lo_p90, hi_p90)
        overlap = max(0, overlap_max - overlap_min)
        span_lo = lo_p90 - lo_p10
        span_hi = hi_p90 - hi_p10
        pct_lo = overlap / span_lo * 100 if span_lo > 0 else 0
        pct_hi = overlap / span_hi * 100 if span_hi > 0 else 0
        flag = "❌ GÂY NHIỄU" if pct_lo > 40 or pct_hi > 40 else ("⚠️  CÓ OVERLAP" if pct_lo > 15 or pct_hi > 15 else "✅")
        print(f"    C{lo}↔C{hi}: overlap=[{overlap_min:.3f}, {overlap_max:.3f}] | C{lo}:{pct_lo:.0f}% | C{hi}:{pct_hi:.0f}% {flag}")

print("\n\n3. PHÂN TÍCH FEATURE PHÂN BIỆT: THỐNG KÊ F (CHỈ SỐ PHÂN TÁCH)")
print("   Giá trị F cao = feature phân biệt tốt giữa các class")
print("-" * 90)
from scipy import stats as scipy_stats
for feat in ALL_FEATURES:
    groups = [df03_real[df03_real['congestion_level'] == cls][feat].dropna().values for cls in range(4)]
    groups = [g for g in groups if len(g) > 1]
    if len(groups) >= 2:
        f_stat, p_val = scipy_stats.f_oneway(*groups)
        quality = "✅ Tốt" if f_stat > 1000 else ("⚠️  Trung bình" if f_stat > 100 else "❌ Kém")
        print(f"  {feat:25s}: F={f_stat:12.1f} | p={p_val:.2e} {quality}")

print("\n\n4. PHÂN TÍCH ĐẶC BIỆT: TIME FEATURES (time_sin, time_cos)")
print("   Kỳ vọng: Không có tương quan đơn điệu với class — chỉ có tính chu kỳ")
print("-" * 90)
for feat in ['time_sin', 'time_cos']:
    print(f"\n  [{feat}] — Phân phối theo class:")
    for cls in range(4):
        sub = df03_real[df03_real['congestion_level'] == cls][feat]
        print(f"    Class {cls}: mean={sub.mean():.3f} | std={sub.std():.3f}")
    # Kiểm tra correlation
    corr = df03_real[feat].corr(df03_real['congestion_level'])
    print(f"    Pearson r với congestion_level: {corr:.3f} {'⚠️ Có tương quan đáng ngờ' if abs(corr) > 0.1 else '✅ OK (không tuyến tính)'}")

print("\n\n5. PHÂN TÍCH is_peak_hour VÀ is_weekend")
print("-" * 90)
for feat in ['is_peak_hour', 'is_weekend']:
    print(f"\n  [{feat}]")
    for cls in range(4):
        sub = df03_real[df03_real['congestion_level'] == cls][feat]
        print(f"    Class {cls}: mean={sub.mean():.3f} (= {sub.mean()*100:.0f}% là 1)")
    corr = df03_real[feat].corr(df03_real['congestion_level'])
    print(f"    Pearson r với congestion_level: {corr:.3f} {'⚠️ Có tương quan' if abs(corr) > 0.05 else '✅ OK'}")

print("\n\n6. TÓM TẮT: Features nào có khả năng gây nhiễu nhất?")
print("-" * 90)
