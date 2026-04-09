import random
from collections import deque

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from src.ml.models.traffic_model import TrafficCongestionModel


class ReplayBuffer:
    """Experience replay storage for DQN training."""

    def __init__(self, capacity=10000):
        self.buffer = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state, done):
        self.buffer.append((state, action, reward, next_state, done))

    def sample(self, batch_size):
        return random.sample(self.buffer, batch_size)

    def __len__(self):
        return len(self.buffer)


class DQNAgent:
    def __init__(self, vocab_sizes, model_path=None, device="cpu", checkpoint_path="best_rl_agent.pt"):
        self.device = device
        self.checkpoint_path = checkpoint_path

        self.gamma = 0.99
        self.epsilon = 1.0
        self.epsilon_min = 0.05
        self.epsilon_decay = 0.85
        self.batch_size = 64
        self.target_update = 10

        self.policy_net = TrafficCongestionModel(vocab_sizes=vocab_sizes).to(self.device)
        self.target_net = TrafficCongestionModel(vocab_sizes=vocab_sizes).to(self.device)

        if model_path:
            print(f"🧠 Đang nạp kiến thức nền tảng từ: {model_path}")
            pretrained_weights = torch.load(model_path, map_location=self.device)
            self.policy_net.load_state_dict(pretrained_weights)

        self.target_net.load_state_dict(self.policy_net.state_dict())
        self.target_net.eval()

        self.memory = ReplayBuffer(capacity=10000)
        self.optimizer = optim.AdamW(self.policy_net.parameters(), lr=1e-5)
        self.loss_fn = nn.SmoothL1Loss()

    def select_action(self, state, evaluate=False):
        if evaluate or random.random() > self.epsilon:
            with torch.no_grad():
                x_dyn = torch.FloatTensor(state["dynamic"]).unsqueeze(0).to(self.device)
                x_stat = torch.FloatTensor(state["static"]).unsqueeze(0).to(self.device)
                x_cat = torch.LongTensor(state["categorical"]).unsqueeze(0).to(self.device)
                q_values = self.policy_net(x_dyn, x_stat, x_cat)
                return torch.argmax(q_values, dim=1).item()
        return random.randrange(6)

    def optimize_model(self):
        if len(self.memory) < self.batch_size:
            return 0.0

        transitions = self.memory.sample(self.batch_size)
        batch_state, batch_action, batch_reward, batch_next_state, batch_done = zip(*transitions)

        x_dyn = torch.FloatTensor(np.array([s["dynamic"] for s in batch_state])).to(self.device)
        x_stat = torch.FloatTensor(np.array([s["static"] for s in batch_state])).to(self.device)
        x_cat = torch.LongTensor(np.array([s["categorical"] for s in batch_state])).to(self.device)

        nx_dyn = torch.FloatTensor(np.array([s["dynamic"] for s in batch_next_state])).to(self.device)
        nx_stat = torch.FloatTensor(np.array([s["static"] for s in batch_next_state])).to(self.device)
        nx_cat = torch.LongTensor(np.array([s["categorical"] for s in batch_next_state])).to(self.device)

        actions = torch.LongTensor(batch_action).unsqueeze(1).to(self.device)
        rewards = torch.FloatTensor(batch_reward).unsqueeze(1).to(self.device)
        dones = torch.FloatTensor(batch_done).unsqueeze(1).to(self.device)

        current_q_values = self.policy_net(x_dyn, x_stat, x_cat).gather(1, actions)

        with torch.no_grad():
            max_next_q_values = self.target_net(nx_dyn, nx_stat, nx_cat).max(1)[0].unsqueeze(1)
            expected_q_values = rewards + (self.gamma * max_next_q_values * (1 - dones))

        loss = self.loss_fn(current_q_values, expected_q_values)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy_net.parameters(), max_norm=1.0)
        self.optimizer.step()

        return loss.item()

    def update_epsilon(self):
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

    def sync_target_network(self):
        self.target_net.load_state_dict(self.policy_net.state_dict())
