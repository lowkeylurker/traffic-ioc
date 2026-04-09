import gymnasium as gym
from gymnasium import spaces
import numpy as np
import torch

class TrafficForecastingEnv(gym.Env):
    """
    Môi trường Giả lập Giao thông cho RL Agent.
    Agent đóng vai trò là "Nhà dự báo", tương tác với môi trường bằng cách 
    nhìn 12 timesteps quá khứ và đưa ra phán đoán cho 15 phút tương lai.
    """
    
    def __init__(self, dataloader, device='cpu'):
        super(TrafficForecastingEnv, self).__init__()
        
        self.dataloader = dataloader
        self.device = device
        
        # Biến iterator để duyệt qua DataLoader
        self.data_iter = iter(self.dataloader)
        self.current_batch = None
        self.batch_idx = 0  # Vị trí con trỏ trong batch hiện tại
        
        # ==========================================
        # 1. ĐỊNH NGHĨA KHÔNG GIAN HÀNH ĐỘNG (ACTION SPACE)
        # ==========================================
        # Agent có 6 lựa chọn tương ứng với 6 mức độ kẹt xe (0 đến 5)
        self.action_space = spaces.Discrete(6)
        
        # ==========================================
        # 2. ĐỊNH NGHĨA KHÔNG GIAN TRẠNG THÁI (OBSERVATION SPACE)
        # ==========================================
        # Không gian này khá phức tạp vì có 3 luồng dữ liệu riêng biệt.
        # Ta dùng spaces.Dict để chứa cả 3 luồng này theo đúng cấu trúc model của bạn.
        self.observation_space = spaces.Dict({
            "dynamic": spaces.Box(low=0, high=1, shape=(12, 5), dtype=np.float32),
            "static": spaces.Box(low=0, high=1, shape=(5,), dtype=np.float32),
            "categorical": spaces.Box(low=0, high=100, shape=(4,), dtype=np.int64) # Max 100 từ vựng (giả định)
        })

    def _get_next_sample(self):
        """Hàm nội bộ để rút 1 dòng dữ liệu từ DataLoader"""
        if self.current_batch is None or self.batch_idx >= len(self.current_batch[0]):
            try:
                # Kéo batch mới
                self.current_batch = next(self.data_iter)
                self.batch_idx = 0
            except StopIteration:
                # Hết epoch, reset lại iterator
                self.data_iter = iter(self.dataloader)
                self.current_batch = next(self.data_iter)
                self.batch_idx = 0
                return None # Tín hiệu kết thúc một Episode lớn
        
        # Trích xuất 1 mẫu duy nhất từ Batch
        x_dyn = self.current_batch[0][self.batch_idx].numpy()
        x_stat = self.current_batch[1][self.batch_idx].numpy()
        x_cat = self.current_batch[2][self.batch_idx].numpy()
        y_true = self.current_batch[3][self.batch_idx].item()
        
        self.batch_idx += 1
        
        obs = {
            "dynamic": x_dyn,
            "static": x_stat,
            "categorical": x_cat
        }
        return obs, y_true

    def reset(self, seed=None, options=None):
        """Khởi tạo lại môi trường (Bắt đầu một vòng lặp mới)"""
        super().reset(seed=seed)
        
        sample = self._get_next_sample()
        if sample is None: # Hết dữ liệu
            self.data_iter = iter(self.dataloader)
            sample = self._get_next_sample()
            
        self.current_obs, self.current_target = sample
        return self.current_obs, {} # Gym yêu cầu trả về (obs, info)

    def calculate_reward(self, action, target):
        """
        Trái tim của hệ thống: Hàm Thưởng/Phạt Bất Đối Xứng (Asymmetric Penalty).
        Ép Agent phải hiểu được tính chất nguy hiểm của kẹt xe thực tế.
        """
        if action == target:
            return 10.0  # Thưởng lớn nếu dự báo chính xác hoàn toàn
        
        diff = action - target
        
        # 1. Bị Phạt Nhẹ: Đoán lệch 1 mức (ví dụ: Kẹt mức 3 đoán mức 4)
        if abs(diff) == 1:
            return -2.0
            
        # 2. Bị Phạt Nặng: Đoán lệch 2 mức trở lên
        if abs(diff) >= 2:
            base_penalty = -5.0 * abs(diff)
            
            # ĐẶC BIỆT: Áp dụng rủi ro "Dương tính giả" vs "Âm tính giả"
            if target >= 4 and action <= 2:
                # Thảm họa: Đường sắp kẹt cứng (4, 5) mà AI xúi là thông thoáng (0, 1, 2)
                # Dẫn đến phương tiện đổ dồn vào gây kẹt nặng hơn -> Phạt cực kỳ nặng
                return base_penalty - 20.0
                
            elif target <= 2 and action >= 4:
                # Cảnh báo quá đà: Đường trống (0, 1) nhưng báo kẹt cứng (4, 5)
                # Làm người dân đi đường vòng tốn thời gian, nhưng không gây kẹt xe cục bộ -> Phạt vừa phải
                return base_penalty - 5.0
                
            return base_penalty

    def step(self, action):
        """
        Agent đưa ra hành động (action). Môi trường tính toán hậu quả và bước tiếp.
        """
        # 1. Tính toán điểm thưởng dựa trên hành động và nhãn thực tế của bước hiện tại
        reward = self.calculate_reward(action, self.current_target)
        
        # 2. Bước sang trạng thái tiếp theo
        sample = self._get_next_sample()
        
        terminated = False
        truncated = False
        
        if sample is None:
            # Nếu hết một DataLoader, coi như kết thúc (Terminate) Episode
            terminated = True
            obs = self.reset()[0] # Reset lại để tránh lỗi null
        else:
            obs, target = sample
            self.current_obs = obs
            self.current_target = target
            
        # Trả về format chuẩn của Gymnasium: (obs, reward, terminated, truncated, info)
        return obs, reward, terminated, truncated, {"actual_label": self.current_target}