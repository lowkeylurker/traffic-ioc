import gymnasium as gym
import numpy as np
from gymnasium import spaces
from src.ml.feature_contract import (
    CATEGORICAL_FEATURE_COLS,
    DYNAMIC_FEATURE_COLS,
    NUM_CLASSES,
    STATIC_MODEL_FEATURE_COLS,
    WINDOW_SIZE_DEFAULT,
)


class TrafficForecastingEnv(gym.Env):
    """Gym environment for congestion-level forecasting decisions."""

    def __init__(self, dataloader, device="cpu", class_weights=None, reward_scale: float = 1.0, reward_clip: float = 250.0):
        super(TrafficForecastingEnv, self).__init__()

        self.dataloader = dataloader
        self.device = device

        self.data_iter = iter(self.dataloader)
        self.current_batch = None
        self.batch_idx = 0
        self.reward_scale = reward_scale
        self.reward_clip = reward_clip

        if class_weights is None:
            self.class_weights = np.ones(NUM_CLASSES, dtype=np.float32)
        else:
            arr = np.asarray(class_weights, dtype=np.float32)
            if arr.shape[0] != NUM_CLASSES:
                raise ValueError(f"class_weights phải có đúng {NUM_CLASSES} phần tử, nhận được {arr.shape[0]}")
            self.class_weights = arr

        self.action_space = spaces.Discrete(NUM_CLASSES)
        self.observation_space = spaces.Dict(
            {
                "dynamic": spaces.Box(
                    low=0,
                    high=1,
                    shape=(WINDOW_SIZE_DEFAULT, len(DYNAMIC_FEATURE_COLS)),
                    dtype=np.float32,
                ),
                "static": spaces.Box(low=0, high=1, shape=(len(STATIC_MODEL_FEATURE_COLS),), dtype=np.float32),
                "categorical": spaces.Box(low=0, high=1000000, shape=(len(CATEGORICAL_FEATURE_COLS),), dtype=np.int64),
            }
        )

    def _calculate_reward_details(self, action, target):
        """
        Reward System V10.0: "BETTER SAFE THAN SORRY" (Extreme Asymmetry).
        Prioritizes safety by heavily penalizing missed jams while minimizing false alarm cost.
        """
        target_weight = float(self.class_weights[int(target)])
        
        is_true_congested = (target >= 3)
        is_pred_congested = (action >= 3)
        diff = abs(int(action) - int(target))
        
        components = {
            "accuracy_bonus": 0.0,
            "adjacency_penalty": 0.0,
            "binary_error_penalty": 0.0,
        }

        # 1. Accuracy Bonus (V12.0: Aggressive Congestion Priority)
        if diff == 0:
            # Tăng mạnh thưởng cho kẹt xe (80 vs 30)
            base_bonus = 80.0 if int(target) >= 3 else 30.0
            components["accuracy_bonus"] = base_bonus * target_weight
        
        # 2. Adjacency Constraint (V10.0: Increased penalty for class drift)
        if diff == 1:
            components["adjacency_penalty"] = -10.0 
        elif diff > 1:
            components["adjacency_penalty"] = -50.0 * diff

        # 3. Binary Boundary & Directional Bias (V12.0: Highly Asymmetric)
        if is_true_congested != is_pred_congested:
            if is_true_congested and not is_pred_congested:
                # Bỏ lỡ kẹt xe phạt cực nặng (False Negative)
                components["binary_error_penalty"] = -250.0
            elif not is_true_congested and is_pred_congested:
                # Báo nhầm kẹt xe phạt nhẹ (False Positive)
                components["binary_error_penalty"] = -50.0

        raw_reward = float(sum(components.values()))
        scaled_reward = float(np.clip(self.reward_scale * raw_reward, -self.reward_clip, self.reward_clip))
        breakdown = {
            **components,
            "target_weight": target_weight,
            "raw_reward": raw_reward,
            "scaled_reward": scaled_reward,
        }
        return scaled_reward, breakdown

    def _get_next_sample(self):
        if self.current_batch is None or self.batch_idx >= len(self.current_batch[0]):
            try:
                self.current_batch = next(self.data_iter)
                self.batch_idx = 0
            except StopIteration:
                self.data_iter = iter(self.dataloader)
                self.current_batch = next(self.data_iter)
                self.batch_idx = 0
                return None

        x_dyn = self.current_batch[0][self.batch_idx].numpy()
        x_stat = self.current_batch[1][self.batch_idx].numpy()
        x_cat = self.current_batch[2][self.batch_idx].numpy()
        y_true = self.current_batch[3][self.batch_idx].item()

        self.batch_idx += 1

        obs = {
            "dynamic": x_dyn,
            "static": x_stat,
            "categorical": x_cat,
        }
        return obs, y_true

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        sample = self._get_next_sample()
        if sample is None:
            self.data_iter = iter(self.dataloader)
            sample = self._get_next_sample()

        self.current_obs, self.current_target = sample
        return self.current_obs, {}

    def calculate_reward(self, action, target):
        reward, _ = self._calculate_reward_details(action, target)
        return reward

    def step(self, action):
        target_for_reward = self.current_target
        reward, reward_breakdown = self._calculate_reward_details(action, target_for_reward)

        sample = self._get_next_sample()

        terminated = False
        truncated = False
    
        if sample is None:
            terminated = True
            obs = self.reset()[0]
        else:
            obs, target = sample
            self.current_obs = obs
            self.current_target = target

        return obs, reward, terminated, truncated, {
            "actual_label": target_for_reward,
            "reward_breakdown": reward_breakdown,
        }
