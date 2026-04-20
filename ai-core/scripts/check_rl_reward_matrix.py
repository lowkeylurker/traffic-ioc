"""Print the RL reward matrix for quick manual validation."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.rl.environments.traffic_env import TrafficForecastingEnv


def main() -> None:
    print("--- KIỂM TRA BẢNG ĐIỂM THƯỞNG/PHẠT TOÀN DIỆN (36 TRƯỜNG HỢP) ---")

    env_mock = TrafficForecastingEnv(dataloader=[])

    level_names = {
        0: "Mức 0 (Rất thoáng)",
        1: "Mức 1 (Thoáng)",
        2: "Mức 2 (Hơi đông)",
        3: "Mức 3 (Ùn ứ)",
        4: "Mức 4 (Kẹt nặng)",
        5: "Mức 5 (Tê liệt)",
    }

    print(f"{'Thực tế (Target)':<20} | {'Dự báo (Action)':<20} | {'Điểm (Reward)':<15} | {'Phân tích logic'}")
    print("=" * 90)

    for target in range(6):
        for action in range(6):
            reward = env_mock.calculate_reward(action, target)
            diff = abs(action - target)

            if diff == 0:
                category = "✅ Chính xác tuyệt đối"
            elif diff == 1:
                category = "⚠️ Lệch nhẹ (Chấp nhận được)"
            elif target >= 4 and action <= 2:
                category = "🚨 THẢM HỌA: Bỏ lọt kẹt xe (Phạt cực nặng)"
            elif target <= 2 and action >= 4:
                category = "🤡 DỌA NGƯỜI DÂN: Báo động giả (Phạt nặng)"
            else:
                category = "❌ Sai số lớn (Phạt theo độ lệch)"

            print(f"{level_names[target]:<20} | {level_names[action]:<20} | {reward:<15} | {category}")

        print("-" * 90)


if __name__ == "__main__":
    main()