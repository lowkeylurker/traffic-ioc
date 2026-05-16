import pandas as pd
import numpy as np
import sys
sys.path.insert(0, '/workspace/ai-core')

df = pd.read_parquet('/workspace/ai-core/data/processed/02_balanced_training_data.parquet')

# Tách real vs synthetic
real = df[df['synthetic_flag'] == 0]
synth = df[df['synthetic_flag'] == 1]

ALL_NUMERIC_COLS = [
    'current_speed_kmh',
    'traffic_index',
    'delay_seconds',
    'free_flow_speed_kmh',
    'time_sin',
    'time_cos',
    'is_peak_hour',
    'is_business_hours',
    'is_weekend',
]

print("=" * 90)
print("KIỂM TRA TÍNH ĐƠN ĐIỆU (MONOTONICITY) THEO CLASS - TẤT CẢ FEATURES")
print("Kỳ vọng: Các feature liên quan đến tắc nghẽn phải tăng/giảm đơn điệu theo Class 0->5")
print("=" * 90)

for col in ALL_NUMERIC_COLS:
    if col not in df.columns:
        continue
    
    means_all = []
    means_real = []
    means_synth = []
    
    for cls in range(6):
        m_all = df[df['congestion_level'] == cls][col].mean()
        m_real = real[real['congestion_level'] == cls][col].mean()
        sub_s = synth[synth['congestion_level'] == cls]
        m_synth = sub_s[col].mean() if len(sub_s) > 0 else float('nan')
        means_all.append(m_all)
        means_real.append(m_real)
        means_synth.append(m_synth)
    
    # Kiểm tra tính đơn điệu
    deltas = [means_all[i+1] - means_all[i] for i in range(5)]
    all_same_sign = all(d > 0 for d in deltas) or all(d < 0 for d in deltas)
    is_monotone = all_same_sign
    
    # Phát hiện điểm bất thường
    violations = []
    for i in range(1, 5):  # Chỉ kiểm tra Class 1-4 (bỏ Class 5 vì ít data)
        if means_all[i] > means_all[i-1] and col in ['current_speed_kmh']:
            violations.append(f"Class {i} > Class {i-1}")
        elif means_all[i] < means_all[i-1] and col in ['delay_seconds', 'traffic_index']:
            violations.append(f"Class {i} < Class {i-1}")
    
    status = "✅ ĐƠN ĐIỆU" if is_monotone else "❌ VI PHẠM"
    print(f"\n{'='*90}")
    print(f"FEATURE: {col} | {status}")
    print(f"{'Class':<8} {'ALL Mean':>12} {'REAL Mean':>12} {'SYNTH Mean':>12} {'Delta ALL':>12}")
    print(f"{'-'*58}")
    for cls in range(6):
        delta_str = f"{means_all[cls]-means_all[cls-1]:+.3f}" if cls > 0 else "   ---"
        synth_str = f"{means_synth[cls]:.3f}" if not np.isnan(means_synth[cls]) else "  N/A"
        print(f"Class {cls}   {means_all[cls]:>12.3f} {means_real[cls]:>12.3f} {synth_str:>12} {delta_str:>12}")
    
    if not is_monotone:
        print(f"  ⚠️  CẢNH BÁO: Feature không đơn điệu - có thể gây nhầm lẫn cho mô hình!")

print("\n" + "=" * 90)
print("KIỂM TRA CHÊNH LỆCH REAL vs SYNTHETIC (Class 4 & 5)")
print("Kỳ vọng: Synthetic phải gần giống Real (mean diff < 15%)")
print("=" * 90)

for col in ['current_speed_kmh', 'traffic_index', 'delay_seconds', 'free_flow_speed_kmh']:
    if col not in df.columns:
        continue
    print(f"\nFeature: {col}")
    for cls in [4, 5]:
        r = real[real['congestion_level'] == cls][col]
        s = synth[synth['congestion_level'] == cls][col]
        if len(r) == 0 or len(s) == 0:
            continue
        diff_pct = abs(r.mean() - s.mean()) / max(abs(r.mean()), 1e-6) * 100
        flag = "❌" if diff_pct > 15 else "✅"
        print(f"  Class {cls}: Real={r.mean():.3f} | Synth={s.mean():.3f} | Diff={diff_pct:.1f}% {flag}")
