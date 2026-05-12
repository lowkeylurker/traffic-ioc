"""Print the RL reward matrix for quick manual validation."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.environments.traffic_env import TrafficForecastingEnv


def main() -> None:
    print("--- KIEM TRA BANG DIEM THUONG/PHAT TOAN DIEN (36 TRUONG HOP) ---")

    env_mock = TrafficForecastingEnv(dataloader=[])

    level_names = {
        0: "Muc 0 (Rat thoang)",
        1: "Muc 1 (Thoang)",
        2: "Muc 2 (Hoi dong)",
        3: "Muc 3 (Un u)",
        4: "Muc 4 (Ket nang)",
        5: "Muc 5 (Te liet)",
    }

    print(f"{'Thuc te (Target)':<20} | {'Du bao (Action)':<20} | {'Diem (Reward)':<15} | {'Phan tich logic'}")
    print("=" * 90)

    for target in range(6):
        for action in range(6):
            reward = env_mock.calculate_reward(action, target)
            diff = abs(action - target)

            if diff == 0:
                category = "Chinh xac tuyet doi"
            elif diff == 1:
                category = "Lech nhe (Chap nhan duoc)"
            elif target >= 4 and action <= 2:
                category = "THAM HOA: Bo lot ket xe (Phat cuc nang)"
            elif target <= 2 and action >= 4:
                category = "DOA NGUOI DAN: Bao dong gia (Phat nang)"
            else:
                category = "Sai so lon (Phat theo do lech)"

            print(f"{level_names[target]:<20} | {level_names[action]:<20} | {reward:<15} | {category}")

        print("-" * 90)


if __name__ == "__main__":
    main()
