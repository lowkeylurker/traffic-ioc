"""
base_agent.py - Abstract Base Class for RL Agents

Định nghĩa interface chung cho RL agents:
- __init__: Load model weights, setup environment
- predict: Observe state -> Output action (0=free, 1=congested)
- update (optional): Update policy (cho training)

Subclasses:
- DQNAgent
- PPOAgent
"""

from abc import ABC, abstractmethod

# TODO: Tri\u1ec3n kh\u1ea3i BaseRLAgent ABC
