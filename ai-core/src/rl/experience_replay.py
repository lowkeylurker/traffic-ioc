"""
experience_replay.py - Replay Buffer for RL Training

Lưu trữ experience trong training DQN:
- Transition: (state, action, reward, next_state, done)
- Sample random minibatch để break correlation

Cung cấp:
- __init__: Initialize buffer với capacity
- push: Add transition
- sample: Random sample minibatch
- __len__: Check buffer size
"""

"""
experience_replay.py - Replay Buffer for DQN

Lưu trữ trải nghiệm (Transitions) và lấy mẫu ngẫu nhiên (Mini-batch) để huấn luyện.
"""

import random
from collections import deque
import numpy as np

class ReplayBuffer:
    def __init__(self, capacity=10000):
        # deque tự động đẩy phần tử cũ nhất ra ngoài khi đạt capacity
        self.buffer = deque(maxlen=capacity)
    
    def push(self, state, action, reward, next_state, done):
        """Lưu trữ một bước thời gian vào bộ nhớ."""
        self.buffer.append((state, action, reward, next_state, done))
    
    def sample(self, batch_size):
        """Lấy ngẫu nhiên một batch để đưa vào mạng PyTorch học."""
        # Chọn ngẫu nhiên batch_size phần tử từ buffer
        batch = random.sample(self.buffer, batch_size)
        
        # Giải nén và gom nhóm các thành phần lại với nhau
        state, action, reward, next_state, done = map(np.stack, zip(*batch))
        
        return state, action, reward, next_state, done
    
    def __len__(self):
        return len(self.buffer)

# Test nhanh bộ nhớ
if __name__ == "__main__":
    buffer = ReplayBuffer(capacity=100)
    
    # Tạo dữ liệu giả: state shape (12, 6)
    dummy_state = np.random.rand(12, 6).astype(np.float32)
    dummy_next = np.random.rand(12, 6).astype(np.float32)
    
    # Nhét 50 trải nghiệm vào bộ nhớ
    for _ in range(50):
        buffer.push(dummy_state, 1, 1.0, dummy_next, False)
        
    print(f"Số lượng trải nghiệm trong bộ nhớ: {len(buffer)}")
    
    # Lấy mẫu 32 trải nghiệm
    s, a, r, s_next, d = buffer.sample(32)
    print(f"Shape của Batch State lấy ra: {s.shape} -> Chuẩn: (32, 12, 6)")
