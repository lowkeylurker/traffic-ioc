import gymnasium as gym
import numpy as np
from gymnasium import spaces
from src.ml.feature_contract import NUM_CLASSES


class TrafficForecastingEnv(gym.Env):
    """Gym environment for congestion-level forecasting decisions."""

    def __init__(self, dataloader, device="cpu", class_weights=None, reward_scale: float = 1.0, reward_clip: float = 30.0):
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
                "dynamic": spaces.Box(low=0, high=1, shape=(12, 5), dtype=np.float32),
                "static": spaces.Box(low=0, high=1, shape=(5,), dtype=np.float32),
                "categorical": spaces.Box(low=0, high=100, shape=(4,), dtype=np.int64),
            }
        )

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
        target_weight = float(self.class_weights[int(target)])

        if action == target:
            reward = 10.0 * target_weight
            return float(np.clip(self.reward_scale * reward, -self.reward_clip, self.reward_clip))

        diff = action - target

        if abs(diff) == 1:
            reward = -2.0 * target_weight
            return float(np.clip(self.reward_scale * reward, -self.reward_clip, self.reward_clip))

        if abs(diff) >= 2:
            base_penalty = -5.0 * abs(diff) * target_weight

            if target >= 4 and action <= 2:
                reward = base_penalty - (20.0 * target_weight)
                return float(np.clip(self.reward_scale * reward, -self.reward_clip, self.reward_clip))
            if target <= 2 and action >= 4:
                reward = base_penalty - 5.0
                return float(np.clip(self.reward_scale * reward, -self.reward_clip, self.reward_clip))

            reward = base_penalty
            return float(np.clip(self.reward_scale * reward, -self.reward_clip, self.reward_clip))

    def step(self, action):
        target_for_reward = self.current_target
        reward = self.calculate_reward(action, target_for_reward)

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

        return obs, reward, terminated, truncated, {"actual_label": target_for_reward}
