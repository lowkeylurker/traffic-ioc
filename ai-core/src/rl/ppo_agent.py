"""
ppo_agent.py - Proximal Policy Optimization (PPO) Agent

Wrapper cho PPO RL agent:
- Load pre-trained policy network từ model path
- Input: Traffic state
- Output: Probability distribution over actions -> Sample action

Sử dụng PyTorch hoặc stable-baselines3.
Policy gradient method, ổn định hơn DQN.
"""

from .base_agent import BaseRLAgent

# TODO: Triển khải PPOAgent
