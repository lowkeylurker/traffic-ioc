import torch
import pandas as pd
import numpy as np
import joblib
import warnings
from datetime import time

warnings.filterwarnings('ignore')

from src.ml.models.traffic_model import TrafficCongestionModel
from src.utils.data_loader import load_bulk_segment_data

FORECAST_WINDOW_START = time(9, 15)
FORECAST_WINDOW_END = time(21, 15)


def _is_within_forecast_window(ts: pd.Timestamp) -> bool:
    """Chỉ cho phép chạy dự báo nếu mốc dự báo nằm trong 09:15 - 21:15."""
    local_time = pd.to_datetime(ts).time()
    return FORECAST_WINDOW_START <= local_time <= FORECAST_WINDOW_END


def _is_continuous_12_steps(df_window: pd.DataFrame) -> bool:
    """12 timesteps cách nhau 15 phút sẽ có độ dài tổng là 165 phút."""
    if len(df_window) != 12:
        return False
    start_time = pd.to_datetime(df_window['timestamp']).iloc[0]
    end_time = pd.to_datetime(df_window['timestamp']).iloc[-1]
    return (end_time - start_time) == pd.Timedelta(minutes=165)

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


def forecast_for_request(
    predictor: RLTrafficPredictor,
    segment_ids: list,
    request_time,
    lookback_steps: int = 12,
    resample_minutes: int = 15,
) -> pd.DataFrame:
    """
    Luồng nghiệp vụ runtime:
    1) Nhận request_time từ App.
    2) Nhận danh sách segment_ids cần dự báo.
    3) Tự động lấy 12 timesteps gần nhất (<= request_time) cho từng segment.
    4) Dự báo cho timestep kế tiếp (+15 phút).
    5) Chỉ giữ kết quả nếu mốc dự báo nằm trong 09:15 - 21:15.
    """
    request_ts = pd.to_datetime(request_time)

    # Lấy rộng hơn 3 giờ để chống thiếu dữ liệu do lệch timestamp/khuyết mẫu.
    lookback_minutes = max(lookback_steps * resample_minutes + 45, 240)
    start_ts = request_ts - pd.Timedelta(minutes=lookback_minutes)

    if not segment_ids:
        raise ValueError("Danh sách segment_ids không được rỗng")

    print(f"\n🛰️ Nhận yêu cầu dự báo tại thời điểm: {request_ts}")
    print(f"📍 Danh sách segments cần dự báo: {segment_ids}")
    print("📡 Đang tải dữ liệu lịch sử gần nhất để dựng cửa sổ 12 timestep...")

    segment_data = load_bulk_segment_data(
        segment_ids=segment_ids,
        start_date=start_ts.strftime('%Y-%m-%d %H:%M:%S'),
        end_date=request_ts.strftime('%Y-%m-%d %H:%M:%S'),
    )

    all_predictions = []
    skipped_not_enough = 0
    skipped_not_continuous = 0
    skipped_out_of_window = 0

    for seg_key, df_segment in segment_data.items():
        if df_segment.empty:
            skipped_not_enough += 1
            continue

        df_segment = df_segment.sort_values('timestamp').reset_index(drop=True)
        df_segment['timestamp'] = pd.to_datetime(df_segment['timestamp'])

        # Chỉ lấy dữ liệu không vượt quá thời điểm App gọi.
        df_hist = df_segment[df_segment['timestamp'] <= request_ts]
        if len(df_hist) < lookback_steps:
            skipped_not_enough += 1
            continue

        df_input = df_hist.tail(lookback_steps).copy()
        if not _is_continuous_12_steps(df_input):
            skipped_not_continuous += 1
            continue

        window_end_time = df_input['timestamp'].iloc[-1]
        forecast_for_time = window_end_time + pd.Timedelta(minutes=resample_minutes)

        if not _is_within_forecast_window(forecast_for_time):
            skipped_out_of_window += 1
            continue

        result = predictor.predict(df_input)
        all_predictions.append(
            {
                'Segment_ID': seg_key,
                'Request_Time': request_ts,
                'Window_End_Time': window_end_time,
                'Forecast_For_Time': forecast_for_time,
                'Dự báo (15p tới)': result['status_description'],
                'Q-Values (Kỳ vọng)': str(result['q_values']),
            }
        )

    print(
        "📊 Thống kê lọc segment | "
        f"Thiếu dữ liệu: {skipped_not_enough}, "
        f"Đứt chuỗi 12 bước: {skipped_not_continuous}, "
        f"Ngoài khung 09:15-21:15: {skipped_out_of_window}"
    )

    return pd.DataFrame(all_predictions)