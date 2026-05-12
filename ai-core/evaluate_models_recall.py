import sys
import os
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import recall_score, classification_report

# Đảm bảo package src được nạp đúng
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), "ai-core"))

from src.ml.feature_contract import DYNAMIC_FEATURE_COLS, STATIC_MODEL_FEATURE_COLS, CATEGORICAL_FEATURE_COLS, TARGET_COL

# ==========================================
# 1. Cấu hình đường dẫn
# ==========================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = SCRIPT_DIR if SCRIPT_DIR.endswith("ai-core") else os.path.join(SCRIPT_DIR, "ai-core")

RL_MODEL_PATH = os.path.join(BASE_DIR, "artifacts/rl/checkpoints/best_rl_agent_warmstart_notebook_warmstart_h15.pt")
ARTIFACTS_PATH = os.path.join(BASE_DIR, "artifacts/ml/preprocessing/preprocessing_artifacts_manual_h15.pkl")
DATA_PATH = os.path.join(BASE_DIR, "data/processed/01_processed_features.parquet")

def evaluate_optimized():
    print("🚀 KHỞI ĐỘNG HỆ THỐNG KIỂM ĐỊNH TỐI ƯU (v8.1 - In-Memory Batch)")
    
    # 1. Load Artifacts
    print(f"📦 Đang nạp Artifacts chuẩn từ {os.path.basename(ARTIFACTS_PATH)}...")
    art = joblib.load(ARTIFACTS_PATH)
    scaler = art['scaler']
    encoders = art['encoders']
    
    # 2. Load Dữ liệu và Chuẩn hóa 100% (Theo logic của Official Predictor)
    print(f"📂 Đang chuẩn bị tập Test cân bằng từ dữ liệu thô...")
    df_raw = pd.read_parquet(DATA_PATH)
    
    # Stratified Sampling 350 mẫu/lớp
    test_indices = []
    for level in range(6):
        indices = df_raw[df_raw[TARGET_COL] == level].index
        valid_indices = [idx for idx in indices if idx >= 11]
        np.random.seed(42)
        count = min(len(valid_indices), 350)
        test_indices.extend(np.random.choice(valid_indices, count, replace=False).tolist())
    
    df_test_raw = df_raw.loc[test_indices].copy()
    y_true = df_test_raw[TARGET_COL].values
    
    # QUAN TRỌNG: Chuẩn hóa toàn bộ DF trước khi cắt window
    df_scaled = scaler.transform(df_raw) # Transform cả DF lớn để đảm bảo context
    for col in CATEGORICAL_FEATURE_COLS:
        if col in encoders:
            valid_classes = set(encoders[col].classes_)
            df_scaled[col] = df_raw[col].apply(lambda x: str(x) if str(x) in valid_classes else str(encoders[col].classes_[0]))
            df_scaled[col] = encoders[col].transform(df_scaled[col])

    # 3. Load Model
    print(f"🧠 Đang nạp Model từ {os.path.basename(RL_MODEL_PATH)}...")
    device = torch.device("cpu")
    ckpt = torch.load(RL_MODEL_PATH, map_location=device)
    sd = ckpt.get("model_state_dict", ckpt)
    
    # Kiến trúc Model
    in_dim = sd["lstm.weight_ih_l0"].shape[1]
    h_size = sd["lstm.weight_ih_l0"].shape[0] // 4
    n_classes = sd["classifier.3.weight"].shape[0]
    n_layers = 2 if "lstm.weight_ih_l1" in sd else 1
    v_sizes = {c: sd[f"embeddings.{c}.weight"].shape[0] if f"embeddings.{c}.weight" in sd else 100 for c in CATEGORICAL_FEATURE_COLS}
    
    from src.ml.models.traffic_model import TrafficCongestionModel
    model = TrafficCongestionModel(vocab_sizes=v_sizes)
    model.lstm = nn.LSTM(input_size=in_dim, hidden_size=h_size, num_layers=n_layers, batch_first=True)
    model.classifier[3] = nn.Linear(h_size, n_classes)
    model.load_state_dict(sd)
    model.eval()

    # 4. Batch Inference
    print(f"⚡ Đang chạy Batch Inference trên {len(test_indices)} mẫu...")
    
    final_dynamic = []
    final_static = []
    final_categorical = []
    
    for idx in test_indices:
        window = df_scaled.iloc[idx - 11 : idx + 1]
        final_dynamic.append(window[DYNAMIC_FEATURE_COLS].values.astype(np.float32))
        final_static.append(df_scaled.iloc[idx][STATIC_MODEL_FEATURE_COLS].values.astype(np.float32))
        final_categorical.append(df_scaled.iloc[idx][CATEGORICAL_FEATURE_COLS].values.astype(np.int64))
        
    with torch.no_grad():
        d_input = torch.from_numpy(np.array(final_dynamic)[:, :, :in_dim])
        s_input = torch.from_numpy(np.array(final_static))
        c_input = torch.from_numpy(np.array(final_categorical))
        
        outputs = model(d_input, s_input, c_input)
        y_pred = torch.argmax(outputs, dim=1).numpy()

    # 5. Xuất báo cáo
    recalls = recall_score(y_true, y_pred, average=None, labels=list(range(n_classes)), zero_division=0)
    
    print(f"\n📊 KẾT QUẢ KIỂM ĐỊNH TỐI ƯU (v8.1):")
    print(f"   Mảng Recall: {np.round(recalls, 4).tolist()}")
    print(f"\n📝 Classification Report (Consistent with Notebook):")
    print(classification_report(y_true, y_pred, labels=list(range(n_classes)), zero_division=0))

if __name__ == "__main__":
    evaluate_optimized()
