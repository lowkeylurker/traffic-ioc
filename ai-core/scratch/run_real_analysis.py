import pandas as pd
import os
from tools.feature_quality.importance import run_importance

def run_real_analysis():
    data_path = "/workspace/ai-core/data/processed/01_processed_features.parquet"
    out_dir = "/workspace/ai-core/reports/feature_qc/importance"
    
    print(f"🔄 Đang đọc dữ liệu từ: {data_path}")
    df = pd.read_parquet(data_path)
    
    # Lấy danh sách đặc trưng (loại bỏ nhãn mục tiêu và các trường không phải số)
    target = 'congestion_level'
    features = [c for c in df.columns if c != target and df[c].dtype in ['float64', 'int64', 'int32']]
    
    print(f"📊 Bắt đầu phân tích {len(features)} đặc trưng trên {len(df)} mẫu...")
    
    # Chạy tool phân tích thực tế
    run_importance(
        df=df,
        features=features,
        target=target,
        out_dir=out_dir,
        sample_size=50000 # Lấy mẫu 50k để chạy cho nhanh nhưng vẫn đảm bảo độ tin cậy
    )
    
    print(f"✅ Đã hoàn thành phân tích. Kết quả lưu tại: {out_dir}")

if __name__ == "__main__":
    run_real_analysis()
