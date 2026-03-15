"""
dqn_agent.py - Deep Q-Network (DQN) Agent

Wrapper cho DQN RL agent:
- Load pre-trained Q-network từ RL_CONGESTION_MODEL_PATH
- Input: Traffic state (speeds, TI, weather, hour, etc.)
- Output: Q-values -> Best action (0=free, 1=congested)

Sử dụng PyTorch.
Thuật toán: Epsilon-greedy exploration.
"""

"""
dqn_agent.py - Deep Q-Network Agent for Congestion Prediction

Mạng Nơ-ron kết hợp LSTM và Linear Layers bằng PyTorch.
"""

import torch
import torch.nn as nn
import numpy as np
import random

class LSTM_QNetwork(nn.Module):
    """
    Kiến trúc Mạng Nơ-ron:
    Input (Batch, Seq_len, Features) -> LSTM -> Linear -> 2 Q-values (Action 0, Action 1)
    """
    def __init__(self, input_dim, hidden_dim=64, num_layers=1, num_actions=2):
        super(LSTM_QNetwork, self).__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        # Lớp LSTM trích xuất đặc trưng chuỗi thời gian
        # batch_first=True nghĩa là input có dạng (batch_size, seq_length, num_features)
        self.lstm = nn.LSTM(input_size=input_dim, hidden_size=hidden_dim, 
                            num_layers=num_layers, batch_first=True)
        
        # Các lớp Linear để đưa ra quyết định
        self.fc1 = nn.Linear(hidden_dim, 32)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(32, num_actions)

    def forward(self, x):
        # x shape: (batch_size, seq_length=12, input_dim=6)
        
        # Truyền qua LSTM. 
        # out chứa output của mọi timestep, (hn, cn) là hidden state cuối cùng
        out, (hn, cn) = self.lstm(x)
        
        # Chúng ta chỉ quan tâm đến output ở timestep cuối cùng của chuỗi (out[:, -1, :])
        last_timestep_out = out[:, -1, :] 
        
        # Truyền qua các lớp Linear
        x = self.fc1(last_timestep_out)
        x = self.relu(x)
        q_values = self.fc2(x) # shape: (batch_size, 2)
        
        return q_values


class DQNAgent:
    """
    Tác nhân RL điều khiển Mạng Nơ-ron và quyết định hành động.
    """
    def __init__(self, state_dim, action_dim=2, hidden_dim=64, lr=1e-3, device="cpu"):
        self.device = torch.device(device)
        self.action_dim = action_dim
        
        # Mạng chính (Policy Network) dùng để chọn hành động
        self.policy_net = LSTM_QNetwork(input_dim=state_dim, hidden_dim=hidden_dim, num_actions=action_dim).to(self.device)
        
        # Mạng mục tiêu (Target Network) dùng để tính Loss ổn định hơn (Sẽ dùng ở Giai đoạn 4)
        self.target_net = LSTM_QNetwork(input_dim=state_dim, hidden_dim=hidden_dim, num_actions=action_dim).to(self.device)
        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval() # Target net chỉ để suy luận, không train trực tiếp
        
        # Bộ tối ưu hóa Adam (Gradient Descent)
        self.optimizer = torch.optim.Adam(self.policy_net.parameters(), lr=lr)
        
    def select_action(self, state, epsilon=0.0):
        """
        Chọn hành động theo chiến lược Epsilon-Greedy:
        - Tỷ lệ epsilon: Chọn ngẫu nhiên (Exploration - Khám phá)
        - Tỷ lệ 1 - epsilon: Chọn theo mô hình (Exploitation - Khai thác)
        """
        if random.random() < epsilon:
            return random.randrange(self.action_dim) # Trả về 0 hoặc 1 ngẫu nhiên
        
        with torch.no_grad(): # Không cần tính đạo hàm khi suy luận
            # Chuyển Numpy Array -> PyTorch Tensor, thêm chiều Batch ở đầu: (1, 12, 6)
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            
            # Đưa qua mạng Nơ-ron để lấy 2 giá trị Q-value
            q_values = self.policy_net(state_tensor)
            
            # Chọn hành động có Q-value lớn nhất (argmax)
            action = q_values.argmax(dim=1).item()
            return action

# ==========================================
# ĐOẠN CODE TEST NHANH MẠNG NƠ-RON
# ==========================================
if __name__ == "__main__":
    print("Khởi tạo thử Mạng Nơ-ron PyTorch...")
    
    # Giả lập State từ môi trường (12 timesteps, 6 features)
    dummy_state = np.random.rand(12, 6).astype(np.float32)
    
    # Khởi tạo Agent
    agent = DQNAgent(state_dim=6, hidden_dim=64)
    
    # Cho Agent chọn hành động ngẫu nhiên (epsilon = 1.0)
    random_action = agent.select_action(dummy_state, epsilon=1.0)
    print(f"Hành động ngẫu nhiên (Epsilon=1.0): {random_action}")
    
    # Cho Agent dùng mạng Nơ-ron để suy luận (epsilon = 0.0)
    model_action = agent.select_action(dummy_state, epsilon=0.0)
    print(f"Hành động từ Mạng LSTM (Epsilon=0.0): {model_action}")
    
    # Kiểm tra Shape khi truyền một Batch (ví dụ 32 samples) vào mạng
    dummy_batch = torch.rand(32, 12, 6)
    q_out = agent.policy_net(dummy_batch)
    print(f"Shape của Output khi truyền Batch 32: {q_out.shape} -> Chuẩn: (32, 2)")