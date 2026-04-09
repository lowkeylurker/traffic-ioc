import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import random
from collections import deque

# Import trực tiếp kiến trúc "bộ não" bạn đã xây dựng ở Giai đoạn 1
from src.ml.models.traffic_model import TrafficCongestionModel

class ReplayBuffer:
    """
    Bộ nhớ kinh nghiệm (Experience Replay).
    Lưu trữ các bước đi (transitions) để Agent lấy ra học ngẫu nhiên (mini-batch).
    """
    def __init__(self, capacity=10000):
        self.buffer = deque(maxlen=capacity)
    
    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))
    
    def sample(self, batch_size):
        return random.sample(self.buffer, batch_size)
    
    def __len__(self):
        return len(self.buffer)

class DQNAgent:
    def __init__(self, vocab_sizes, model_path=None, device='cpu'):
        self.device = device
        
        # --- CÁC SIÊU THAM SỐ CỦA RL (HYPERPARAMETERS) ---
        self.gamma = 0.99           # Hệ số chiết khấu (Discount factor) - Coi trọng tương lai
        self.epsilon = 1.0          # Khởi đầu với 100% tỷ lệ khám phá ngẫu nhiên
        self.epsilon_min = 0.05     # Tỷ lệ khám phá tối thiểu (5%)
        self.epsilon_decay = 0.85  # Tốc độ giảm sự tò mò sau mỗi bước
        self.batch_size = 64
        self.target_update = 10     # Cập nhật mạng Target sau mỗi 10 Episodes
        
        # --- KHỞI TẠO 2 MẠNG Q-NETWORK ---
        # 1. Policy Net: Mạng nơ-ron Tác tử trực tiếp dùng để ra quyết định và cập nhật gradient
        self.policy_net = TrafficCongestionModel(vocab_sizes=vocab_sizes).to(self.device)
        
        # 2. Target Net: Mạng nơ-ron ổn định dùng để tính điểm Q dự kiến (tránh bị nhiễu)
        self.target_net = TrafficCongestionModel(vocab_sizes=vocab_sizes).to(self.device)
        
        # [QUAN TRỌNG] Tích hợp Pre-trained Model từ Giai đoạn 1
        if model_path:
            print(f"🧠 Đang nạp kiến thức nền tảng từ: {model_path}")
            pretrained_weights = torch.load(model_path, map_location=self.device)
            self.policy_net.load_state_dict(pretrained_weights)
            
        # Đồng bộ hóa mạng Target giống hệt mạng Policy ban đầu và khóa gradient
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval() 
        
        # Khởi tạo Bộ nhớ và Tối ưu hóa
        self.memory = ReplayBuffer(capacity=10000)
        
        # Dùng Learning Rate rất nhỏ (1e-5) vì mô hình đã học xong Giai đoạn 1 rồi, giờ chỉ là tinh chỉnh (Fine-tune)
        self.optimizer = optim.AdamW(self.policy_net.parameters(), lr=1e-5) 
        
        # SmoothL1Loss (Huber Loss) chống chịu tốt với các điểm dị thường (outliers) hơn MSE
        self.loss_fn = nn.SmoothL1Loss() 

    def select_action(self, state, evaluate=False):
        """
        Chiến lược Epsilon-Greedy: Cân bằng giữa Khám phá (Explore) và Khai thác (Exploit)
        """
        # Nếu đang ở chế độ Evaluate (Test thật), không ngẫu nhiên nữa, lấy hành động tốt nhất
        if evaluate or random.random() > self.epsilon:
            with torch.no_grad():
                # state hiện tại đang là dictionary, cần rã ra Tensor và thêm chiều Batch (unsqueeze)
                x_dyn = torch.FloatTensor(state['dynamic']).unsqueeze(0).to(self.device)
                x_stat = torch.FloatTensor(state['static']).unsqueeze(0).to(self.device)
                x_cat = torch.LongTensor(state['categorical']).unsqueeze(0).to(self.device)
                
                # Mạng Policy dự báo Q-Values cho cả 6 hành động
                q_values = self.policy_net(x_dyn, x_stat, x_cat)
                
                # Chọn hành động có điểm Q cao nhất
                action = torch.argmax(q_values, dim=1).item()
                return action
        else:
            # Tò mò khám phá: Chọn ngẫu nhiên 1 trong 6 nhãn (0 đến 5)
            return random.randrange(6)

    def optimize_model(self):
        """
        Cốt lõi của RL: Rút kinh nghiệm từ quá khứ và cập nhật trọng số
        """
        if len(self.memory) < self.batch_size:
            return 0.0 # Chưa đủ dữ liệu để học
            
        # 1. Rút ngẫu nhiên một lô (batch) từ bộ nhớ
        transitions = self.memory.sample(self.batch_size)
        
        # Rã tuple (state, action, reward, next_state, done) thành các list riêng biệt
        batch_state, batch_action, batch_reward, batch_next_state, batch_done = zip(*transitions)
        
        # 2. Xử lý State (Chuyển đổi list of Dicts thành Batched Tensors)
        x_dyn = torch.FloatTensor(np.array([s['dynamic'] for s in batch_state])).to(self.device)
        x_stat = torch.FloatTensor(np.array([s['static'] for s in batch_state])).to(self.device)
        x_cat = torch.LongTensor(np.array([s['categorical'] for s in batch_state])).to(self.device)
        
        # Xử lý Next State tương tự
        nx_dyn = torch.FloatTensor(np.array([s['dynamic'] for s in batch_next_state])).to(self.device)
        nx_stat = torch.FloatTensor(np.array([s['static'] for s in batch_next_state])).to(self.device)
        nx_cat = torch.LongTensor(np.array([s['categorical'] for s in batch_next_state])).to(self.device)
        
        # Chuyển đổi Action, Reward, Done sang Tensor
        actions = torch.LongTensor(batch_action).unsqueeze(1).to(self.device)
        rewards = torch.FloatTensor(batch_reward).unsqueeze(1).to(self.device)
        dones = torch.FloatTensor(batch_done).unsqueeze(1).to(self.device)

        # 3. Tính Q-Values hiện tại: Q(s, a)
        # policy_net trả ra 6 giá trị, ta dùng gather để lấy đúng giá trị Q của hành động đã chọn
        current_q_values = self.policy_net(x_dyn, x_stat, x_cat).gather(1, actions)

        # 4. Tính Q-Values mục tiêu (Target) bằng phương trình Bellman
        with torch.no_grad():
            # Tìm giá trị Q lớn nhất của trạng thái tiếp theo từ mạng Target
            max_next_q_values = self.target_net(nx_dyn, nx_stat, nx_cat).max(1)[0].unsqueeze(1)
            
            # Tính Toán Y_target = Reward + Gamma * Max(Q_next)
            # Nếu done = 1 (kết thúc Episode), thì tương lai không còn giá trị (nhân với 0)
            expected_q_values = rewards + (self.gamma * max_next_q_values * (1 - dones))

        # 5. Cập nhật Gradient (Backpropagation)
        loss = self.loss_fn(current_q_values, expected_q_values)
        
        self.optimizer.zero_grad()
        loss.backward()
        
        # Clip gradient để tránh bùng nổ đạo hàm (tương tự GĐ 1)
        torch.nn.utils.clip_grad_norm_(self.policy_net.parameters(), max_norm=1.0)
        self.optimizer.step()
        
        return loss.item()

    def update_epsilon(self):
        """Giảm dần tỷ lệ khám phá để Agent tập trung vào kiến thức đã học"""
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)
        
    def sync_target_network(self):
        """Đồng bộ trọng số từ Policy Net sang Target Net"""
        self.target_net.load_state_dict(self.policy_net.state_dict())