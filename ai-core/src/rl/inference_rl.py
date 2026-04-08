import torch
import pandas as pd
import numpy as np
import joblib
import warnings

warnings.filterwarnings('ignore')

# Import kiến trúc mạng nơ-ron gốc (Vì Agent RL dùng chung não với SL)
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ml.traffic_model import TrafficCongestionModel
from utils.data_loader import load_bulk_corridor_data

class RLTrafficPredictor:
    """
    Module Suy luận dành riêng cho Tác tử Reinforcement Learning.
    Thay vì dự báo dựa trên xác suất toán học, nó dự báo dựa trên 
    Điểm thưởng kỳ vọng (Q-Values) để giảm thiểu rủi ro thảm họa kẹt xe.
    """
    def __init__(self, model_path='best_rl_agent.pt', artifacts_path='preprocessing_artifacts.pkl', device=None):
        self.device = device if device else torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
        
        # 1. Tải bộ từ vựng và công cụ chuẩn hóa
        print("📥 Đang nạp Preprocessing Artifacts...")
        try:
            self.artifacts = joblib.load(artifacts_path)
            self.scaler = self.artifacts['scaler']
            self.encoders = self.artifacts['encoders']
            self.vocab_sizes = {col: len(enc.classes_) for col, enc in self.encoders.items()}
        except FileNotFoundError:
            raise Exception(f"❌ Không tìm thấy file {artifacts_path}. Vui lòng kiểm tra lại đường dẫn.")

        # 2. Khởi tạo "Bộ não" và nạp tệp trọng số của Tác tử RL
        print(f"🧠 Đang nạp Tác tử RL từ: {model_path}...")
        self.agent_net = TrafficCongestionModel(vocab_sizes=self.vocab_sizes).to(self.device)
        try:
            self.agent_net.load_state_dict(torch.load(model_path, map_location=self.device))
            self.agent_net.eval() # Chuyển sang chế độ suy luận (tắt Dropout)
        except FileNotFoundError:
            raise Exception(f"❌ Không tìm thấy file {model_path}. Hãy chắc chắn bạn đã huấn luyện xong RL.")
            
        self.level_names = {
            0: "Mức 0 (Rất thoáng)",
            1: "Mức 1 (Thoáng)",
            2: "Mức 2 (Hơi đông)",
            3: "Mức 3 (Ùn ứ)",
            4: "Mức 4 (Kẹt nặng)",
            5: "Mức 5 (Tê liệt)"
        }

        # Cố định schema đầu vào đúng như lúc train để tránh lệch thứ tự cột.
        self.dynamic_cols = [
            'current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'quality_flag'
        ]
        self.static_cols = [
            'default_lane_count', 'static_free_flow', 'time_sin', 'time_cos', 'weather_severity'
        ]
        self.cat_cols = ['osm_highway_type', 'district', 'shift_code', 'day_of_week']

    def preprocess_window(self, df_window):
        """Xử lý cửa sổ 12 timesteps để đưa vào GPU"""
        if len(df_window) != 12:
            raise ValueError(f"Cần đúng 12 timesteps để inference, nhận được {len(df_window)} dòng.")

        df_processed = df_window.copy()
        
        # 1. Mã hóa Categorical an toàn
        for col in self.cat_cols:
            le = self.encoders[col]
            known_classes = set(le.classes_)
            df_processed[col] = df_processed[col].apply(lambda x: x if str(x) in known_classes else le.classes_[0])
            df_processed[col] = le.transform(df_processed[col].astype(str))
            
        # 2. Scale Dữ liệu
        # Scaler trả về DataFrame, ta giữ nguyên để dễ gỡ bỏ cột
        scaled_df = self.scaler.transform(df_processed)

        # 3. Trích xuất đặc trưng theo TÊN CỘT để tránh lệch schema khi DataFrame có cột phát sinh.
        x_dynamic = torch.FloatTensor(
            scaled_df[self.dynamic_cols].to_numpy(dtype=np.float32)
        ).unsqueeze(0).to(self.device)
        x_static = torch.FloatTensor(
            scaled_df[self.static_cols].iloc[-1].to_numpy(dtype=np.float32)
        ).unsqueeze(0).to(self.device)
        x_cat = torch.LongTensor(
            scaled_df[self.cat_cols].iloc[-1].to_numpy(dtype=np.int64)
        ).unsqueeze(0).to(self.device)
        
        return x_dynamic, x_static, x_cat
    
    def predict(self, df_window):
        """Tiến hành dự báo bằng Q-Values"""
        x_dynamic, x_static, x_cat = self.preprocess_window(df_window)
        
        with torch.no_grad():
            # Mạng xuất ra 6 giá trị Q-Value tương ứng với 6 mức độ
            q_values = self.agent_net(x_dynamic, x_static, x_cat)
            
            # Chọn Hành động (Mức kẹt xe) có điểm Q cao nhất
            best_action = torch.argmax(q_values, dim=1).item()
            
            # Lấy danh sách điểm Q để phân tích (Chuyển tensor thành list)
            q_list = q_values.squeeze().cpu().numpy()
            
        return {
            'predicted_level': best_action,
            'status_description': self.level_names[best_action],
            'q_values': np.round(q_list, 2)
        }

# =====================================================================
# KHỐI CHẠY THỰC TẾ (BATCH PROCESSING)
# =====================================================================
if __name__ == "__main__":
    print("--- 🚦 HỆ THỐNG DỰ BÁO ĐIỀU PHỐI GIAO THÔNG THÔNG MINH (RL-AGENT) ---")
    
    try:
        predictor = RLTrafficPredictor()
        
        # Kéo giả lập dữ liệu mới nhất (Ví dụ: sáng ngày 8/4/2026)
        print("\n📡 Đang kết nối Database để lấy tín hiệu 3 giờ gần nhất...")
        corridor_data = load_bulk_corridor_data(
            corridor_id=646713380690000556, 
            start_date='2026-04-08 17:00:00', 
            end_date='2026-04-08 21:00:00'
        )
        
        if corridor_data:
            all_predictions = []
            
            for seg_key, df_segment in corridor_data.items():
                if len(df_segment) < 12:
                    continue
                    
                df_input = df_segment.tail(12).copy()
                
                # CHẶN LỖI THỜI GIAN QUA ĐÊM (Giữ vững phong độ kỹ sư)
                start_time = df_input['timestamp'].iloc[0]
                end_time = df_input['timestamp'].iloc[-1]
                if (end_time - start_time) != pd.Timedelta(minutes=165):
                    continue
                    
                # Chạy Tác tử RL
                result = predictor.predict(df_input)
                
                all_predictions.append({
                    "Segment_ID": seg_key,
                    "Current_Time": end_time,
                    "Dự báo (15p tới)": result['status_description'],
                    "Q-Values (Kỳ vọng)": str(result['q_values'])
                })
                
            # Tổng hợp và In kết quả
            df_results = pd.DataFrame(all_predictions)
            
            print("\n" + "="*85)
            print("🚀 KẾT QUẢ DỰ BÁO TỪ TÁC TỬ HỌC TĂNG CƯỜNG (TOP 5 ĐOẠN ĐƯỜNG)")
            print("="*85)
            print(df_results.head().to_string(index=False))
            print("="*85)
            
            print(f"\n✅ Hệ thống đã hoàn tất dự báo an toàn cho {len(df_results)} đoạn đường.")
            print("💡 Lưu ý: Cột 'Q-Values' thể hiện điểm số nội bộ của AI. Số càng cao ở class nào, AI càng tin rằng chọn class đó sẽ tối đa hóa lợi ích điều phối giao thông.")
            
    except Exception as e:
        print(e)