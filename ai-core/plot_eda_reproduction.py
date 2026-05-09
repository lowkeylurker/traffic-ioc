import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def reproduce_full_eda():
    data_path = "/workspace/ai-core/data/processed/01_processed_features.parquet"
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    
    print("🔄 Đang đọc dữ liệu cho phân tích EDA toàn diện...")
    df = pd.read_parquet(data_path)
    
    # Lấy danh sách đặc trưng số (loại bỏ timestamp)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    features_only = [c for c in numeric_cols if c != 'congestion_level' and c != 'time_key']

    # 1. BIỂU ĐỒ TƯƠNG QUAN VỚI BIẾN MỤC TIÊU (Correlation with Target)
    plt.figure(figsize=(10, 8), dpi=300)
    target_corr = df[numeric_cols].corr()['congestion_level'].sort_values(ascending=False)
    target_corr = target_corr.drop(['congestion_level']) # Loại bỏ chính nó
    
    colors = ['red' if x > 0 else 'blue' for x in target_corr]
    target_corr.plot(kind='barh', color=colors, alpha=0.7)
    plt.title('Độ tương quan giữa các đặc trưng và Mức độ ùn tắc', fontsize=12, fontweight='bold')
    plt.xlabel('Pearson Correlation Coefficient')
    plt.grid(axis='x', ls='--', alpha=0.3)
    plt.savefig(os.path.join(pic_dir, 'feature_target_correlation.png'), bbox_inches='tight')
    plt.close()
    print("✅ Đã lưu Correlation with Target.")

    # 2. BOXPLOT PHÂN TÁCH ĐẶC TRƯNG (Feature Separability)
    # Chọn ra top 4 đặc trưng quan trọng nhất để vẽ boxplot
    top_features = ['traffic_index', 'free_flow_speed_kmh', 'time_sin', 'delay_seconds']
    
    fig, axes = plt.subplots(2, 2, figsize=(12, 10), dpi=300)
    axes = axes.flatten()
    
    for i, col in enumerate(top_features):
        if col in df.columns:
            sns.boxplot(x='congestion_level', y=col, data=df, ax=axes[i], palette='Set2')
            axes[i].set_title(f'Phân tách: {col}', fontsize=10, fontweight='bold')
            axes[i].set_xlabel('Congestion Level')
            axes[i].set_ylabel('Value')

    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    plt.suptitle('Khả năng phân tách của các đặc trưng chính theo nhãn mục tiêu', fontsize=14, fontweight='bold')
    plt.savefig(os.path.join(pic_dir, 'feature_separability_boxplot.png'), bbox_inches='tight')
    plt.close()
    print("✅ Đã lưu Separability Boxplots.")

    # 3. PHÂN TÍCH TÍNH CHU KỲ (Temporal Heatmap)
    # Vẽ heatmap theo Giờ và Thứ trong tuần cho Traffic Index
    if 'day_of_week' in df.columns:
        df['hour'] = pd.to_datetime(df['timestamp']).dt.hour
        pivot_table = df.pivot_table(values='traffic_index', index='day_of_week', columns='hour', aggfunc='mean')
        
        plt.figure(figsize=(12, 6), dpi=300)
        sns.heatmap(pivot_table, cmap='YlOrRd', annot=False)
        plt.title('Bản đồ nhiệt mật độ giao thông theo Thời gian (Giờ vs Thứ)', fontsize=12, fontweight='bold')
        plt.xlabel('Giờ trong ngày')
        plt.ylabel('Thứ trong tuần (0=Mon, 6=Sun)')
        plt.savefig(os.path.join(pic_dir, 'temporal_traffic_heatmap.png'), bbox_inches='tight')
        plt.close()
        print("✅ Đã lưu Temporal Traffic Heatmap.")

if __name__ == "__main__":
    reproduce_full_eda()
