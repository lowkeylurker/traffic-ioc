import gymnasium as gym
import numpy as np
from gymnasium import spaces


class TrafficForecastingEnv(gym.Env):
    """Gym environment for congestion-level forecasting decisions."""

    def __init__(self, dataloader, device="cpu"):
        super(TrafficForecastingEnv, self).__init__()

        self.dataloader = dataloader
        self.device = device

        self.data_iter = iter(self.dataloader)
        self.current_batch = None
        self.batch_idx = 0

        self.action_space = spaces.Discrete(6)
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
        if action == target:
            return 10.0

        diff = action - target

        if abs(diff) == 1:
            return -2.0

        if abs(diff) >= 2:
            base_penalty = -5.0 * abs(diff)

            if target >= 4 and action <= 2:
                return base_penalty - 20.0
            if target <= 2 and action >= 4:
                return base_penalty - 5.0

            return base_penalty

    def step(self, action):
        reward = self.calculate_reward(action, self.current_target)

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

        return obs, reward, terminated, truncated, {"actual_label": self.current_target}
