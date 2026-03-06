"""
congestion_env.py - Custom Gym Environment for Congestion Prediction

Định nghĩa Gym environment mô phỏng traffic congestion:

State space:
- speeds (history): Last 3 hours speeds
- traffic_index: Current TI
- los: Current LOS
- hour, is_peak, weather

Action space:
- 0: Predict "not congested" (free)
- 1: Predict "congested"

Reward:
- +1.0 nếu prediction correct
- -1.0 nếu prediction wrong
- -0.5 nếu uncertain

Done: Mỗi episode = 15 minutes
"""

import gymnasium as gym

# TODO: Triển khải CongestionEnv
