import torch
import torch.nn.functional as F
import pandas as pd
import numpy as np
import joblib  # Dùng để load Scaler và Encoders đã lưu từ lúc Train
import logging

# Import chính xác kiến trúc mô hình đã định nghĩa
from src.ml.traffic_model import TrafficCongestionModel
from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    CLASS_MAPPING,
    DYNAMIC_FEATURE_COLS,
    STATIC_MODEL_FEATURE_COLS,
)

logger = logging.getLogger(__name__)

class TrafficPredictor:
    def __init__(self, model_path: str, artifacts_path: str, device=None):
        """
        Khởi tạo Predictor bằng cách nạp Trọng số (Weights) và các công cụ Tiền xử lý (Artifacts).
        """
        self.device = device if device else torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # 1. NẠP CÔNG CỤ TIỀN XỬ LÝ (SCALER & ENCODERS)
        # Lưu ý: Cần bổ sung đoạn code lưu joblib.dump(scaler) và encoders trong file train.py của bạn
        artifacts = joblib.load(artifacts_path)
        self.scaler = artifacts['scaler']
        self.encoders = artifacts['encoders']
        
        # Lấy kích thước từ điển tự động từ encoders để khởi tạo mô hình
        vocab_sizes = {col: len(enc.classes_) for col, enc in self.encoders.items()}
        
        # 2. KHỞI TẠO KIẾN TRÚC MÔ HÌNH VÀ NẠP TRỌNG SỐ
        self.model = TrafficCongestionModel(
            vocab_sizes=vocab_sizes,
            embedding_dim=8,
            hidden_dim=64,
            num_classes=6
        ).to(self.device)
        
        # Load state_dict (Do file train.py đang dùng torch.save(model.state_dict(), ...))
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval() # Bắt buộc: Tắt Dropout và cố định BatchNorm
        
        self.dynamic_cols = DYNAMIC_FEATURE_COLS
        self.static_cols = STATIC_MODEL_FEATURE_COLS
        self.cat_cols = CATEGORICAL_FEATURE_COLS
        self.class_mapping = CLASS_MAPPING

    def preprocess_streaming_data(self, df_recent: pd.DataFrame) -> tuple:
        """
        Xử lý 1 DataFrame chứa đúng 12 timesteps gần nhất (3 tiếng) của 1 segment.
        Trả về 3 Tensors (x_dynamic, x_static, x_cat) sẵn sàng cho hàm forward.
        """
        # Đảm bảo dữ liệu sắp xếp theo thời gian tăng dần
        df_sorted = df_recent.sort_values('timestamp').reset_index(drop=True)
        
        # 1. BIẾN ĐỔI LABEL ENCODING CHO BIẾN CATEGORICAL
        df_encoded = df_sorted.copy()
        for col in self.cat_cols:
            # Dùng encoder đã fit lúc train. Thêm xử lý lỗi nếu gặp giá trị mới (unseen labels)
            le = self.encoders[col]
            fallback_value = str(le.classes_[0])
            encoded_col = df_encoded[col].astype(str).copy()
            unseen_mask = ~encoded_col.isin(le.classes_)

            if unseen_mask.any():
                unseen_examples = encoded_col[unseen_mask].value_counts().head(5).to_dict()
                logger.warning(
                    "Unseen category detected for '%s': count=%d, examples=%s. Fallback='%s'.",
                    col,
                    int(unseen_mask.sum()),
                    unseen_examples,
                    fallback_value,
                )
                encoded_col.loc[unseen_mask] = fallback_value

            df_encoded[col] = le.transform(encoded_col)
            
        # 2. CHUẨN HÓA MIN-MAX SCALING CHO BIẾN LIÊN TỤC
        # Tái sử dụng hàm transform của TrafficScaler từ dataset.py
        df_scaled = self.scaler.transform(df_encoded)
        
        # 3. TRÍCH XUẤT THÀNH TENSORS VÀ THÊM BATCH_DIMENSION (unsqueeze)
        # Dynamic: Lấy toàn bộ 12 timesteps
        x_dynamic_np = df_scaled[self.dynamic_cols].astype(np.float32).values
        x_dynamic = torch.tensor(x_dynamic_np, dtype=torch.float32).unsqueeze(0).to(self.device)
        
        # Static & Categorical: Khác với Dynamic, đặc trưng tĩnh/nhãn không đổi hoặc chỉ quan tâm mốc hiện tại. 
        # Ta lấy dòng cuối cùng (timestep thứ 12) theo logic trong dataset.py
        x_static_np = df_scaled[self.static_cols].iloc[-1].astype(np.float32).values
        x_static = torch.tensor(x_static_np, dtype=torch.float32).unsqueeze(0).to(self.device)
        
        x_cat_np = df_scaled[self.cat_cols].iloc[-1].astype(np.int64).values
        x_cat = torch.tensor(x_cat_np, dtype=torch.long).unsqueeze(0).to(self.device)
        
        return x_dynamic, x_static, x_cat

    def predict_next_15_mins(self, df_recent: pd.DataFrame) -> dict:
        """
        Nhận DataFrame 12 timesteps và dự báo trạng thái giao thông 15 phút tới.
        """
        if len(df_recent) != 12:
            raise ValueError(f"Dữ liệu đầu vào cần chính xác 12 timesteps (có {len(df_recent)}). Hãy kiểm tra lại Data Loader.")

        x_dynamic, x_static, x_cat = self.preprocess_streaming_data(df_recent)
        
        with torch.no_grad():
            logits = self.model(x_dynamic, x_static, x_cat)
            probabilities = F.softmax(logits, dim=1)
            
            predicted_idx = torch.argmax(probabilities, dim=1).item()
            confidence = probabilities[0][predicted_idx].item() * 100
            
        return {
            "predicted_level": predicted_idx,
            "status_description": self.class_mapping[predicted_idx],
            "confidence_percentage": round(confidence, 2)
        }