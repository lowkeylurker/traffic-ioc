import torch
import torch.nn.functional as F
import pandas as pd
import numpy as np
import joblib  # Dùng để load Scaler và Encoders đã lưu từ lúc Train

# Import chính xác kiến trúc mô hình đã định nghĩa
from src.ml.traffic_model import TrafficCongestionModel

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
        
        # Cấu hình các cột đầu vào bám sát logic của dataset.py & traffic_model.py
        self.dynamic_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag']
        self.static_cols = ['default_lane_count', 'static_free_flow', 'time_sin', 'time_cos', 'weather_severity']
        
        # Thứ tự BẮT BUỘC phải khớp với biến cat_cols trong hàm forward() của traffic_model.py
        self.cat_cols = ['osm_highway_type', 'district', 'shift_code', 'day_of_week']
        
        self.class_mapping = {
            0: "Thông thoáng tuyệt đối", 1: "Lưu thông ổn định", 
            2: "Mật độ hơi cao", 3: "Đông đúc - Di chuyển chậm", 
            4: "Ùn ứ - Có rủi ro kẹt xe", 5: "Kẹt xe nghiêm trọng"
        }

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
            # Biến các giá trị chưa từng thấy thành giá trị phổ biến nhất (hoặc index 0)
            known_classes = set(le.classes_)
            df_encoded[col] = df_encoded[col].apply(lambda x: x if x in known_classes else le.classes_[0])
            df_encoded[col] = le.transform(df_encoded[col].astype(str))
            
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

# ==========================================
# TEST PIPELINE DỰ BÁO TRỰC TIẾP
# ==========================================
if __name__ == "__main__":
    from src.utils.data_loader import load_bulk_corridor_data
    
    print("--- KHỞI ĐỘNG HỆ THỐNG DỰ BÁO THỜI GIAN THỰC ---")
    
    # Giả định file trọng số và artifacts đã được lưu từ quá trình huấn luyện
    MODEL_PATH = "best_traffic_model.pt"
    ARTIFACTS_PATH = "preprocessing_artifacts.pkl" # Chứa dictionary: {'scaler': scaler_obj, 'encoders': dict_of_encoders}
    
    try:
        predictor = TrafficPredictor(model_path=MODEL_PATH, artifacts_path=ARTIFACTS_PATH)
        
        # Lấy một đoạn dữ liệu lịch sử để test luồng dự báo (Mô phỏng dữ liệu streaming thực tế)
        print("Đang truy xuất 12 timesteps gần nhất từ Database...")
        corridor_data = load_bulk_corridor_data(corridor_id=646713380690000556, start_date='2026-04-07 07:00:00', end_date='2026-04-07 10:00:00')
        
        if corridor_data:
            # Lấy đại 1 segment để test
            sample_seg_key = list(corridor_data.keys())[0]
            df_segment = corridor_data[sample_seg_key]
            
            # Chỉ lấy 12 dòng cuối cùng làm đầu vào cho mô hình
            df_input = df_segment.tail(12).copy()
            
            print(f"\n🛣️  Dự báo cho đoạn đường (Segment KEY): {sample_seg_key}")
            print(f"🕒  Thời điểm hiện tại (Dữ liệu chốt sổ): {df_input['timestamp'].iloc[-1]}")
            
            result = predictor.predict_next_15_mins(df_input)
            
            print("\n" + "="*45)
            print("🚀 KẾT QUẢ DỰ BÁO 15 PHÚT TỚI")
            print("="*45)
            print(f"Mức kẹt xe dự kiến : {result['predicted_level']} - {result['status_description']}")
            print(f"Độ tin cậy (AI tự tin): {result['confidence_percentage']}%")
            print("="*45)
            
    except FileNotFoundError:
        print("⚠️ LỖI: Chưa tìm thấy file 'best_traffic_model.pt' hoặc 'preprocessing_artifacts.pkl'.")
        print("Vui lòng chạy lại file train.py và sử dụng thư viện joblib để lưu lại Scaler và Encoders nhé.")