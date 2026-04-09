"""Manual training runner for the RL pipeline."""

from __future__ import annotations

from pathlib import Path
import sys
import warnings

import joblib
import pandas as pd
import torch
from torch.utils.data import DataLoader

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.data.dataset import TrafficDataset
from src.rl.agent import DQNAgent
from src.rl.inference_rl import _is_continuous_12_steps
from src.rl.main_rl import train_rl_agent
from src.rl.traffic_env import TrafficForecastingEnv
from src.utils.data_loader import load_bulk_corridor_data


def main() -> None:
    warnings.filterwarnings("ignore")
    print("--- CHUẨN BỊ MÔI TRƯỜNG DỮ LIỆU CHO RL ---")

    try:
        print("📥 Đang nạp Preprocessing Artifacts...")
        artifacts = joblib.load("preprocessing_artifacts.pkl")
        encoders = artifacts["encoders"]
        scaler = artifacts["scaler"]
        vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}

        print("⏳ Đang kéo dữ liệu Sàn đấu...")
        corridor_data = load_bulk_corridor_data(
            corridor_id=646713380690000556,
            start_date="2026-03-20",
            end_date="2026-04-08",
        )
        df_rl = pd.concat(corridor_data.values(), ignore_index=True)
        df_rl = df_rl.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)

        print("⚙️ Đang áp dụng Transform...")
        cat_cols = ["osm_highway_type", "district", "shift_code", "day_of_week"]
        for col in cat_cols:
            le = encoders[col]
            known_classes = set(le.classes_)
            df_rl[col] = df_rl[col].apply(lambda value: value if str(value) in known_classes else le.classes_[0])
            df_rl[col] = le.transform(df_rl[col].astype(str))

        df_rl_scaled = scaler.transform(df_rl)
        rl_dataset = TrafficDataset(df_rl_scaled, window_size=12)
        rl_loader = DataLoader(rl_dataset, batch_size=64, shuffle=False)

        device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
        print(f"💻 Thiết bị xử lý: {str(device).upper()}")
        print(f"✅ Đã tạo thành công Môi trường với {len(rl_dataset)} State hợp lệ!")

        env = TrafficForecastingEnv(dataloader=rl_loader, device=device)

        pretrained_model_path = "best_traffic_model.pt"
        agent = DQNAgent(
            vocab_sizes=vocab_sizes,
            model_path=pretrained_model_path,
            device=device,
        )

        train_rl_agent(env=env, agent=agent, num_episodes=20)

    except FileNotFoundError as exc:
        print(f"⚠️ LỖI QUAN TRỌNG: {exc}")


if __name__ == "__main__":
    main()