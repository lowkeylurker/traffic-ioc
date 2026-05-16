import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')
df = df[df['synthetic_flag'] == 0].copy()  # REAL data only
df['speed_ratio'] = (df['current_speed_kmh'] / df['free_flow_speed_kmh'].replace(0, np.nan)).clip(0.0, 1.5).fillna(1.0)
df = df.sort_values(['segment_key', 'timestamp']).reset_index(drop=True)

WINDOW_SIZE = 12
TARGET_OFFSET = 1

print("=" * 90)
print("PHÂN TÍCH WINDOW-LEVEL FEATURES — ĐÚNG VỚI CÁCH MODEL HUẤN LUYỆN")
print("Mỗi cửa sổ = 12 timesteps liên tiếp, nhãn = class tại timestep tiếp theo")
print("=" * 90)

# Tạo window aggregations để phân tích
# Thay vì row-level, tính: mean, std (biến động), trend (last-first)
print("\n⏳ Đang tính window features (có thể mất 1-2 phút)...")

DYNAMIC_FEATS = ['speed_ratio', 'traffic_index', 'delay_seconds']

# Lấy mẫu ngẫu nhiên để nhanh hơn (100k windows/class)
SAMPLE_PER_CLASS = 50000

windows = []
all_labels = df['congestion_level'].astype(int).values
all_segments = df['segment_key'].values

# Tìm valid window indices
valid_indices = []
for idx in range(WINDOW_SIZE - 1, len(df) - TARGET_OFFSET):
    if all_segments[idx - (WINDOW_SIZE - 1)] == all_segments[idx] == all_segments[idx + TARGET_OFFSET]:
        valid_indices.append(idx)

valid_indices = np.array(valid_indices)
valid_labels = all_labels[valid_indices + TARGET_OFFSET]  # label là bước tiếp theo

print(f"Tổng cửa sổ hợp lệ: {len(valid_indices):,}")

rng = np.random.default_rng(42)
sampled_rows = []
for cls in range(4):
    cls_idx = valid_indices[valid_labels == cls]
    n = min(SAMPLE_PER_CLASS, len(cls_idx))
    chosen = rng.choice(cls_idx, size=n, replace=False)
    for end_idx in chosen:
        window_df = df.iloc[end_idx - (WINDOW_SIZE - 1): end_idx + 1]
        row = {'label': cls}
        for feat in DYNAMIC_FEATS:
            vals = window_df[feat].values.astype(float)
            row[f'{feat}_mean']  = vals.mean()
            row[f'{feat}_std']   = vals.std()
            row[f'{feat}_trend'] = vals[-1] - vals[0]  # Xu hướng: dương = tăng, âm = giảm
            row[f'{feat}_last']  = vals[-1]             # Giá trị cuối cùng trong cửa sổ
        sampled_rows.append(row)

df_win = pd.DataFrame(sampled_rows)
print(f"Đã tạo {len(df_win):,} windows mẫu\n")

print("\n1. WINDOW-LEVEL OVERLAP — KHÁC BIỆT SO VỚI ROW-LEVEL")
print("-" * 90)

win_feats = [c for c in df_win.columns if c != 'label']
from scipy import stats as scipy_stats

for feat in win_feats:
    groups = [df_win[df_win['label'] == cls][feat].values for cls in range(4)]
    overlaps = []
    for lo, hi in [(0,1), (1,2), (2,3)]:
        lo_p10, lo_p90 = np.percentile(groups[lo], 10), np.percentile(groups[lo], 90)
        hi_p10, hi_p90 = np.percentile(groups[hi], 10), np.percentile(groups[hi], 90)
        ov_min = max(lo_p10, hi_p10)
        ov_max = min(lo_p90, hi_p90)
        ov = max(0, ov_max - ov_min)
        span_lo = lo_p90 - lo_p10
        span_hi = hi_p90 - hi_p10
        pct = (ov/span_lo*100 + ov/span_hi*100) / 2 if span_lo > 0 and span_hi > 0 else 0
        overlaps.append(pct)
    max_ov = max(overlaps)
    flag = "❌ GÂY NHIỄU" if max_ov > 40 else ("⚠️  CÓ OVERLAP" if max_ov > 15 else "✅ Tốt")
    f_stat, _ = scipy_stats.f_oneway(*groups)
    print(f"  {feat:30s}: MaxOverlap={max_ov:5.0f}% | F={f_stat:12.1f} {flag}")

print("\n\n2. SO SÁNH: ROW-LEVEL vs WINDOW-LEVEL (delay_seconds)")
print("-" * 90)
print("\n  ROW-LEVEL delay_seconds (đã phân tích trước):")
print("    C2↔C3: overlap 100% — KHÔNG phân biệt được")
print("\n  WINDOW-LEVEL (sau khi LSTM xử lý chuỗi 12 bước):")
for stat in ['mean', 'std', 'trend', 'last']:
    feat = f'delay_seconds_{stat}'
    overlaps = []
    for lo, hi in [(0,1), (1,2), (2,3)]:
        g_lo = df_win[df_win['label'] == lo][feat].values
        g_hi = df_win[df_win['label'] == hi][feat].values
        lo_p10, lo_p90 = np.percentile(g_lo, 10), np.percentile(g_lo, 90)
        hi_p10, hi_p90 = np.percentile(g_hi, 10), np.percentile(g_hi, 90)
        ov_min, ov_max = max(lo_p10, hi_p10), min(lo_p90, hi_p90)
        ov = max(0, ov_max - ov_min)
        span_lo = lo_p90 - lo_p10
        pct = ov/span_lo*100 if span_lo > 0 else 0
        overlaps.append(pct)
    print(f"    delay_{stat:6s}: C0↔C1={overlaps[0]:4.0f}% | C1↔C2={overlaps[1]:4.0f}% | C2↔C3={overlaps[2]:4.0f}%")

print("\n\n3. TREND FEATURES — ĐÂY LÀ THÔNG TIN THỰC SỰ CỦA WINDOW")
print("   trend > 0 = đang xấu đi | trend < 0 = đang cải thiện")
print("-" * 90)
for feat in ['speed_ratio_trend', 'traffic_index_trend', 'delay_seconds_trend']:
    print(f"\n  [{feat}]")
    for cls in range(4):
        vals = df_win[df_win['label'] == cls][feat]
        pct_getting_worse = (vals > 0).mean() * 100
        print(f"    Class {cls}: mean={vals.mean():+.4f} | {pct_getting_worse:.0f}% đang xấu đi")
