"""
congestion_env.py - Custom Gym Environment for Congestion Prediction

Định nghĩa Gym environment mô phỏng traffic congestion:

State space (history_window x 6 features):
- current_speed_kmh
- pcu_volume
- traffic_index
- delay_seconds
- is_peak_hour
- weather_severity

Action space:
- 0: Predict "not congested" (free)
- 1: Predict "congested"

Reward:
- +1.0: True Positive
- +0.5: True Negative
- -1.0: False Positive
- -2.0: False Negative

Done: Kết thúc khi đi hết các sliding-window sample trong tập dữ liệu.
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

class CongestionEnv(gym.Env):
    """
    Môi trường Custom Gym cho bài toán phân loại kẹt xe nhị phân bằng RL.
    """
    def __init__(self, df: pd.DataFrame, history_window=12, prediction_horizon=1, congestion_threshold=0.6):
        super(CongestionEnv, self).__init__()
        
        self.history_window = history_window
        self.prediction_horizon = prediction_horizon
        self.congestion_threshold = congestion_threshold
        
        # Chọn các đặc trưng (features) đưa vào mô hình học
        # Chú ý: Cập nhật thêm cột delay_seconds dựa trên dữ liệu thực tế của bạn
        self.feature_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 
                             'delay_seconds', 'is_peak_hour', 'weather_severity']
        
        # 1. Chuẩn hóa dữ liệu (Normalization)
        self.scaler = MinMaxScaler()
        self.scaled_data = self.scaler.fit_transform(df[self.feature_cols])
        
        # Dữ liệu gốc để lấy nhãn (Target Label)
        self.raw_traffic_index = df['traffic_index'].values
        
        # 2. Cắt dữ liệu thành các Cửa sổ trượt (Sliding Windows)
        self.states, self.labels = self._build_sequences()
        self.n_samples = len(self.states)

        min_required_rows = self.history_window + self.prediction_horizon
        if self.n_samples == 0:
            raise ValueError(
                "Insufficient data to build RL sequences. "
                f"Need at least {min_required_rows} rows, got {len(df)}."
            )

        self.current_step = 0
        
        # 3. Định nghĩa Không gian Hành động (Action Space): 0 (Không kẹt), 1 (Có kẹt)
        self.action_space = spaces.Discrete(2)
        
        # 4. Định nghĩa Không gian Quan sát (Observation Space)
        # Shape sẽ là (12, 6) -> 12 timesteps (180 phút), 6 features
        self.observation_space = spaces.Box(
            low=0, high=1, 
            shape=(self.history_window, len(self.feature_cols)), 
            dtype=np.float32
        )

    def _build_sequences(self):
        """Hàm nội bộ: Tạo ma trận State và Target Labels."""
        X, y = [], []
        # Duyệt qua dữ liệu, chừa lại khoảng trống cho prediction_horizon
        for i in range(len(self.scaled_data) - self.history_window - self.prediction_horizon + 1):
            # Ma trận State: Từ i đến i + history_window
            window = self.scaled_data[i : i + self.history_window]
            
            # Nhãn (Label): Lấy traffic_index ở timestep tương lai
            target_idx = i + self.history_window + self.prediction_horizon - 1
            target_ti = self.raw_traffic_index[target_idx]
            
            # Phân loại nhị phân: 1 nếu TI >= threshold, ngược lại 0
            label = 1 if target_ti >= self.congestion_threshold else 0
            
            X.append(window)
            y.append(label)
            
        return np.array(X, dtype=np.float32), np.array(y, dtype=np.int8)

    def reset(self, seed=None, options=None):
        """Khởi tạo lại môi trường; mặc định random điểm bắt đầu để tăng đa dạng episode."""
        super().reset(seed=seed)

        start_idx = None
        if options and isinstance(options, dict):
            start_idx = options.get("start_idx")

        if start_idx is not None:
            self.current_step = int(np.clip(start_idx, 0, self.n_samples - 1))
        else:
            self.current_step = int(self.np_random.integers(0, self.n_samples))

        return self.states[self.current_step], {}

    def step(self, action):
        """Nhận action từ Agent, trả về State mới và Reward."""
        # Lấy nhãn thực tế của bước hiện tại
        true_label = self.labels[self.current_step]
        
        # 5. Cài đặt Reward Function (Hàm phần thưởng)
        reward = 0.0
        if action == 1 and true_label == 1:
            reward = 1.0    # True Positive: Cảnh báo đúng kẹt xe
        elif action == 0 and true_label == 0:
            reward = 0.5    # True Negative: Dự báo đúng đường thoáng
        elif action == 1 and true_label == 0:
            reward = -1.0   # False Positive: Báo kẹt nhầm (Báo động giả)
        elif action == 0 and true_label == 1:
            reward = -2.0   # False Negative: Bỏ lọt kẹt xe (Lỗi nghiêm trọng nhất)

        # Chuyển sang bước tiếp theo
        self.current_step += 1
        
        # Kiểm tra xem đã đi hết tập dữ liệu chưa
        terminated = self.current_step >= self.n_samples - 1
        truncated = False # Không dùng time limit trong bài toán này
        
        # Lấy State tiếp theo (Nếu chưa kết thúc)
        next_state = self.states[self.current_step] if not terminated else np.zeros_like(self.states[0])
        
        # Thông tin bổ sung dùng để debug
        info = {"true_label": true_label}
        
        return next_state, reward, terminated, truncated, info

# ==========================================
# ĐOẠN CODE TEST NHANH MÔI TRƯỜNG
# ==========================================
if __name__ == "__main__":
    from src.utils.data_loader import load_segment_data
    
    # 1. Kéo dữ liệu (Thay segment_id thật của bạn)
    print("Đang tải dữ liệu từ Database...")
    df = load_segment_data(segment_id=299925978432640808, start_date='2026-03-09', end_date='2026-03-12')
    
    # 2. Khởi tạo môi trường
    env = CongestionEnv(df=df, history_window=12, prediction_horizon=1, congestion_threshold=0.15)
    
    # 3. Chạy thử 5 bước ngẫu nhiên
    state, _ = env.reset()
    print(f"Khởi tạo Môi trường thành công! Shape của State: {state.shape}\n")
    
    for i in range(5):
        action = env.action_space.sample() # Máy tự chọn bừa 0 hoặc 1
        next_state, reward, terminated, truncated, info = env.step(action)
        print(f"Bước {i+1}: Action dự đoán={action} | Thực tế={info['true_label']} | Nhận Reward={reward}")
        if terminated:
            break