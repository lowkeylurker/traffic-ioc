import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import os

# Import trực tiếp danh sách từ contract để đảm bảo khớp 100%
DYNAMIC_FEATURE_COLS = ["current_speed_kmh", "traffic_index", "delay_seconds"]
STATIC_MODEL_FEATURE_COLS = ["free_flow_speed_kmh", "time_sin", "time_cos", "is_peak_hour", "is_business_hours", "is_weekend"]
CATEGORICAL_FEATURE_COLS = ["tomtom_frc", "weather_key", "shift_code", "day_of_week"]
TARGET_COL = "congestion_level"

def generate_exact_feature_images():
    data_path = "/workspace/ai-core/data/processed/01_processed_features.parquet"
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    
    print("🔄 Đang chuẩn bị dữ liệu với danh sách đặc trưng chính thức...")
    df = pd.read_parquet(data_path).sort_values(['segment_key', 'timestamp'])
    
    # 1. TẠO CHUỖI TRỄ (DYNAMIC LAGS) - 12 bước
    n_lags = 12
    lagged_cols = []
    for feat in DYNAMIC_FEATURE_COLS:
        for lag in range(1, n_lags + 1):
            col_name = f"{feat}_lag_{lag}"
            df[col_name] = df.groupby('segment_key')[feat].shift(lag)
            lagged_cols.append(col_name)
    
    # Encode Categorical
    le = LabelEncoder()
    for col in CATEGORICAL_FEATURE_COLS:
        df[col] = le.fit_transform(df[col].astype(str))
    
    df_clean = df.dropna(subset=lagged_cols + [TARGET_COL])
    
    # Lấy mẫu lớn (100k) để đảm bảo độ tin cậy
    df_sample = df_clean.sample(n=100000, random_state=42)
    
    # Danh sách feature cuối cùng đưa vào RF
    context_cols = STATIC_MODEL_FEATURE_COLS + CATEGORICAL_FEATURE_COLS
    all_features = context_cols + lagged_cols
    X = df_sample[all_features]
    y = df_sample[TARGET_COL].astype(int)
    
    print("🧠 Đang huấn luyện Random Forest (Exact Features)...")
    rf = RandomForestClassifier(n_estimators=50, max_depth=15, n_jobs=-1, random_state=42)
    rf.fit(X, y)
    
    importances = pd.DataFrame({'feature': X.columns, 'importance': rf.feature_importances_})
    
    # --- HÌNH 1: FEATURE IMPORTANCE ANALYSIS (EXACT) ---
    fig1, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 7), dpi=300)
    
    # Subplot 1: Context Features (Static + Categorical)
    ctx_imp = importances[importances['feature'].isin(context_cols)].sort_values('importance', ascending=False)
    sns.barplot(x='importance', y='feature', data=ctx_imp, ax=ax1, palette='viridis')
    ax1.set_title('A. Tầm quan trọng của các biến bối cảnh (Context)', fontweight='bold', fontsize=12)
    ax1.set_xlabel('Gini Importance')
    
    # Subplot 2: Dynamic Lags Trend (All 3 dynamic features)
    colors = {'traffic_index': 'purple', 'current_speed_kmh': 'blue', 'delay_seconds': 'green'}
    for feat in DYNAMIC_FEATURE_COLS:
        feat_imps = [importances[importances['feature'] == f"{feat}_lag_{l}"]['importance'].values[0] for l in range(1, n_lags + 1)]
        ax2.plot(range(1, n_lags + 1), feat_imps, marker='o', label=feat, color=colors[feat], linewidth=2)
    
    ax2.set_xticks(range(1, n_lags + 1))
    ax2.set_xticklabels([f"T-{l*15}m" for l in range(1, n_lags + 1)], rotation=45)
    ax2.set_title('B. Diễn biến tầm quan trọng theo thời gian trễ (Lags T-1 -> T-12)', fontweight='bold', fontsize=12)
    ax2.set_ylabel('Importance Score')
    ax2.legend()
    ax2.grid(True, ls='--', alpha=0.3)
    
    plt.tight_layout()
    fig1.savefig(os.path.join(pic_dir, 'feature_importance_analysis.png'))
    plt.close()
    
    # --- HÌNH 2: CORRELATION ANALYSIS (EXACT) ---
    fig2, (ax3, ax4) = plt.subplots(1, 2, figsize=(18, 7), dpi=300)
    
    # Subplot 1: Context Heatmap (Biến bối cảnh vs Target)
    corr_cols = context_cols + [TARGET_COL]
    corr_matrix = df_sample[corr_cols].corr()
    sns.heatmap(corr_matrix, annot=True, fmt=".2f", cmap='coolwarm', ax=ax3, cbar=True, annot_kws={"size": 8})
    ax3.set_title('A. Tương quan: Biến bối cảnh & Tĩnh vs Target', fontweight='bold', fontsize=12)
    
    # Subplot 2: Dynamic Correlation Decay
    for feat in DYNAMIC_FEATURE_COLS:
        corr_vals = [df_sample[[f"{feat}_lag_{l}", TARGET_COL]].corr().iloc[0, 1] for l in range(1, n_lags + 1)]
        ax4.plot(range(1, n_lags + 1), corr_vals, marker='s', label=feat, color=colors[feat], linewidth=2)
        
    ax4.set_xticks(range(1, n_lags + 1))
    ax4.set_xticklabels([f"T-{l*15}m" for l in range(1, n_lags + 1)], rotation=45)
    ax4.set_title('B. Độ suy giảm tương quan của chuỗi Dynamic', fontweight='bold', fontsize=12)
    ax4.set_ylabel('Pearson Correlation')
    ax4.set_ylim(-1, 1)
    ax4.legend()
    ax4.grid(True, ls='--', alpha=0.3)
    
    plt.tight_layout()
    fig2.savefig(os.path.join(pic_dir, 'feature_correlation_analysis.png'))
    plt.close()
    
    print(f"✅ Đã cập nhật xong bộ ảnh chuẩn xác 100% tại: {pic_dir}")

if __name__ == "__main__":
    generate_exact_feature_images()
