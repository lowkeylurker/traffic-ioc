import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import os

def plot_feature_qc_full():
    pic_dir = "/workspace/ai-core/pictures"
    report_dir = "/workspace/ai-core/reports/feature_qc/importance"
    data_path = "/workspace/ai-core/data/processed/01_processed_features.parquet"
    os.makedirs(pic_dir, exist_ok=True)

    # 1. VẼ FEATURE IMPORTANCE TOÀN BỘ (DỮ LIỆU THẬT)
    ranking_path = os.path.join(report_dir, 'feature_ranking.csv')
    if os.path.exists(ranking_path):
        df_imp = pd.read_csv(ranking_path)
        
        # Tăng kích thước hình để chứa đủ tất cả feature
        plt.figure(figsize=(10, 8), dpi=300)
        colors = sns.color_palette("viridis_r", len(df_imp))
        bars = plt.barh(df_imp['feature'], df_imp['mean_importance'], color=colors, edgecolor='gray')
        plt.gca().invert_yaxis()
        
        for bar in bars:
            width = bar.get_width()
            plt.text(width + 0.005, bar.get_y() + bar.get_height()/2, f'{width*100:.2f}%', 
                     va='center', fontsize=8, fontweight='bold')

        plt.title('Xếp hạng toàn bộ đặc trưng (Random Forest Gini Importance)', 
                  fontsize=13, fontweight='bold', pad=20)
        plt.xlabel('Importance Score')
        plt.xlim(0, max(df_imp['mean_importance']) * 1.15)
        plt.grid(axis='x', ls='--', alpha=0.3)
        
        save_path_imp = os.path.join(pic_dir, 'feature_importance_ranking.png')
        plt.savefig(save_path_imp, bbox_inches='tight')
        plt.close()
        print(f"✅ Đã lưu bảng xếp hạng đầy đủ: {save_path_imp}")

    # 2. VẼ HEATMAP CORRELATION TOÀN BỘ (DỮ LIỆU THẬT)
    if os.path.exists(data_path):
        print("🔄 Đang tính toán ma trận tương quan cho toàn bộ đặc trưng...")
        df = pd.read_parquet(data_path)
        
        # Chỉ lấy các cột số
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # Loại bỏ nhãn mục tiêu và time_key nếu có
        exclude = ['congestion_level', 'time_key', 'quality_flag']
        plot_cols = [c for c in numeric_cols if c not in exclude]
        
        df_corr = df[plot_cols].corr()

        plt.figure(figsize=(12, 10), dpi=300)
        mask = np.triu(np.ones_like(df_corr, dtype=bool))
        sns.heatmap(df_corr, mask=mask, annot=True, fmt=".2f", cmap='RdBu_r', center=0, 
                    linewidths=.5, cbar_kws={"shrink": .8}, annot_kws={"size": 7})
        
        # Đọc thông tin các biến bị loại bỏ để đánh dấu
        mc_path = os.path.join(report_dir, 'multicollinearity_removed.csv')
        if os.path.exists(mc_path):
            df_mc = pd.read_csv(mc_path)
            for i, row in df_mc.iterrows():
                plt.text(0.5, 0.5 + i*0.4, f"Removed: {row['removed']}", 
                         color='red', fontsize=7, fontweight='bold', ha='left',
                         bbox=dict(facecolor='white', alpha=0.6, edgecolor='red'))

        plt.title('Ma trận tương quan toàn diện (All Features)', 
                  fontsize=13, fontweight='bold', pad=20)
        
        save_path_corr = os.path.join(pic_dir, 'correlation_heatmap.png')
        plt.savefig(save_path_corr, bbox_inches='tight')
        plt.close()
        print(f"✅ Đã lưu Heatmap toàn diện: {save_path_corr}")

if __name__ == "__main__":
    plot_feature_qc_full()
