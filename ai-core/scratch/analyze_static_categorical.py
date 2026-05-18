import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')
from scipy import stats as scipy_stats

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')
df_real = df[df['synthetic_flag'] == 0].copy()

print("=" * 90)
print("PHÂN TÍCH NHÓM STATIC & CATEGORICAL FEATURES — CLASS 0-3")
print("=" * 90)

# ===================================================================
# STATIC FEATURES (window-level — giá trị cố định trong cả window)
# ===================================================================
print("\n1. STATIC FEATURES (time_sin, time_cos, is_peak_hour, is_weekend)")
print("   → Được FNN xử lý như vector đặc trưng, không phải sequence")
print("-" * 90)
STATIC = ['time_sin', 'time_cos', 'is_peak_hour', 'is_weekend']

for feat in STATIC:
    groups = [df_real[df_real['congestion_level'] == cls][feat].values for cls in range(4)]
    f_stat, p_val = scipy_stats.f_oneway(*groups)
    means = [g.mean() for g in groups]
    r = df_real[feat].corr(df_real['congestion_level'])
    monotone = all(means[i] <= means[i+1] for i in range(3)) or all(means[i] >= means[i+1] for i in range(3))
    quality = "✅ Đơn điệu" if monotone else "⚠️  Không đơn điệu"
    print(f"\n  [{feat}]  F={f_stat:.0f} | Pearson r={r:.3f} | {quality}")
    for cls in range(4):
        print(f"    Class {cls}: mean={means[cls]:.3f}")

# ===================================================================
# CATEGORICAL FEATURES — phân tích theo distribution
# ===================================================================
print("\n\n2. CATEGORICAL FEATURES (tomtom_frc, weather_key, shift_code, day_of_week)")
print("   → Embedding layer, cần kiểm tra: mỗi class có phân phối category riêng không?")
print("   Nếu phân phối giống nhau → feature không giúp phân biệt class")
print("-" * 90)

CAT_FEATS = ['tomtom_frc', 'weather_key', 'shift_code', 'day_of_week']
for feat in CAT_FEATS:
    if feat not in df_real.columns:
        print(f"\n  [{feat}] — KHÔNG TỒN TẠI TRONG PARQUET")
        continue

    print(f"\n  [{feat}]")
    # Chi-squared test: phân phối category có khác nhau giữa classes không?
    all_categories = sorted(df_real[feat].unique())
    contingency = []
    for cls in range(4):
        sub = df_real[df_real['congestion_level'] == cls]
        counts = [sub[sub[feat] == cat].shape[0] for cat in all_categories]
        contingency.append(counts)
    contingency = np.array(contingency, dtype=float)
    # Chỉ giữ categories có đủ mẫu
    col_sums = contingency.sum(axis=0)
    contingency = contingency[:, col_sums > 0]
    if contingency.shape[1] > 1:
        chi2, p_val, dof, _ = scipy_stats.chi2_contingency(contingency)
        discriminative = "✅ Phân biệt tốt" if p_val < 0.05 else "❌ Không phân biệt"
        print(f"    Chi2={chi2:.1f} | p={p_val:.2e} | Categories={len(all_categories)} {discriminative}")
        # Phân phối top categories theo class
        for cls in range(4):
            sub = df_real[df_real['congestion_level'] == cls]
            top = sub[feat].value_counts(normalize=True).head(3)
            top_str = " | ".join([f"{cat}:{pct*100:.0f}%" for cat, pct in top.items()])
            print(f"    Class {cls}: {top_str}")
    else:
        print(f"    Chỉ có 1 category — không hữu ích")

# ===================================================================
# TỔNG HỢP CUỐI
# ===================================================================
print("\n\n3. TỔNG HỢP TẤT CẢ FEATURE GROUPS")
print("=" * 90)
print("""
DYNAMIC FEATURES (LSTM xử lý sequence 12 bước):
  ✅ speed_ratio       — Phân tách sắc nét (row-level 0% overlap), trend = signal mạnh
  ✅ speed_ratio_delta — Mới thêm: xu hướng thay đổi tốc độ, LSTM học trực tiếp
  ✅ traffic_index     — Gần như nghịch đảo speed_ratio, xác nhận thêm tín hiệu
  ✅ delay_seconds     — Trend +165s/window (C3) vs -24s/window (C0) = signal lớn nhất

STATIC FEATURES (FNN xử lý 1 vector):
  ⚠️  time_sin/cos     — Không đơn điệu theo class (bình thường — feature thời gian)
                         LSTM dùng làm context "khi nào", không phải "kẹt bao nhiêu"
  ⚠️  is_peak_hour     — Tương quan yếu (r=0.107) nhưng hữu ích cho context
  ✅  is_weekend       — Hỗ trợ phân biệt kẹt cuối tuần vs ngày thường

CATEGORICAL FEATURES (Embedding):
  → Cần kết quả chi2 test để kết luận
""")
