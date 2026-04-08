import torch
import torch.nn.functional as F
import pandas as pd
import numpy as np
import joblib  # Dùng để load Scaler và Encoders đã lưu từ lúc Train
import logging

# Import chính xác kiến trúc mô hình đã định nghĩa
from src.ml.traffic_model import TrafficCongestionModel

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

# ==========================================
# TEST PIPELINE DỰ BÁO TRỰC TIẾP (CHUẨN NGHIỆP VỤ)
# ==========================================
if __name__ == "__main__":
    from src.utils.data_loader import load_bulk_corridor_data
    import pandas as pd
    
    print("--- KHỞI ĐỘNG HỆ THỐNG DỰ BÁO THỜI GIAN THỰC ---")
    
    MODEL_PATH = "best_traffic_model.pt"
    ARTIFACTS_PATH = "preprocessing_artifacts.pkl"
    
    try:
        predictor = TrafficPredictor(model_path=MODEL_PATH, artifacts_path=ARTIFACTS_PATH)
        
        # 1. Kéo dữ liệu thời gian thực (Giả lập)
        print("Đang truy xuất dữ liệu gần nhất từ Database...")
        corridor_data = load_bulk_corridor_data(
            corridor_id=646713380690000556, 
            start_date='2026-04-07 07:00:00', 
            end_date='2026-04-07 10:00:00'
        )
        
        if corridor_data:
            print(f"\n🛣️ Bắt đầu chạy dự báo cho {len(corridor_data)} segments...")
            
            # Danh sách lưu trữ toàn bộ kết quả dự báo
            all_predictions = []
            
            # 2. VÒNG LẶP NGHIỆP VỤ: Quét qua TẤT CẢ các segment_id
            for seg_key, df_segment in corridor_data.items():
                
                # Bỏ qua các segment bị thiếu dữ liệu (không đủ 12 timesteps)
                if len(df_segment) < 12:
                    continue
                    
                # Chỉ lấy 12 dòng cuối cùng làm đầu vào
                df_input = df_segment.tail(12).copy()

                # 12 timesteps liên tục cách nhau 15 phút -> Khoảng cách từ dòng đầu đến dòng cuối phải CHÍNH XÁC là:
                # 11 khoảng x 15 phút = 165 phút
                
                start_time_of_window = df_input['timestamp'].iloc[0]
                end_time_of_window = df_input['timestamp'].iloc[-1]
                
                time_diff = end_time_of_window - start_time_of_window
                expected_diff = pd.Timedelta(minutes=165)
                
                # Nếu khoảng thời gian bị giãn ra (tức là bị dính dữ liệu qua đêm) thì BỎ QUA không dự báo
                if time_diff != expected_diff:
                    print(f"⚠️ Bỏ qua Segment {seg_key} lúc {end_time_of_window} do dữ liệu thiếu liên tục (nhảy qua đêm).")
                    continue
                # ======================================================

                current_time = df_input['timestamp'].iloc[-1]
                
                # Gọi Model dự báo
                result = predictor.predict_next_15_mins(df_input)
                
                # Đóng gói kết quả
                all_predictions.append({
                    "segment_key": seg_key,
                    "current_timestamp": current_time,
                    "predicted_level": result['predicted_level'],
                    "status_description": result['status_description'],
                    "confidence_percentage": result['confidence_percentage']
                })
            
            # 3. KẾT XUẤT KẾT QUẢ
            df_results = pd.DataFrame(all_predictions)
            
            print("\n" + "="*60)
            print("🚀 TỔNG HỢP KẾT QUẢ DỰ BÁO 15 PHÚT TỚI (TOP 5 SEGMENTS)")
            print("="*60)
            # In ra 5 segments đầu tiên để xem thử
            print(df_results.head().to_string(index=False))
            print("="*60)
            
            print(f"\n✅ Đã hoàn tất dự báo cho {len(df_results)} segments.")
            print("💡 Trong thực tế, df_results này sẽ được dùng để ghi vào bảng fact_predictions trong Data Warehouse hoặc trả về dạng JSON cho API.")
            
    except FileNotFoundError:
        print("⚠️ LỖI: Chưa tìm thấy file 'best_traffic_model.pt' hoặc 'preprocessing_artifacts.pkl'.")