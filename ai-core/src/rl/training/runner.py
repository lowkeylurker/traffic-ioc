"""Shared runner utilities for RL training modes."""

from __future__ import annotations

import os
import json
import random
from pathlib import Path

import joblib
import pandas as pd
import numpy as np
import torch
from sklearn.preprocessing import LabelEncoder
from torch.utils.data import DataLoader

from src.ml.data.dataset import TrafficDataset
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.ml.feature_contract import CATEGORICAL_FEATURE_COLS
from src.data_access import get_segments_in_corridor
from src.rl.artifacts import (
    get_rl_checkpoint_path,
    get_rl_history_path,
    get_rl_metrics_path,
    get_rl_preprocessing_artifacts_path,
)
from src.rl.agents.dqn_agent import DQNAgent
from src.rl.environments.traffic_env import TrafficForecastingEnv
from src.rl.inference.evaluator import evaluate_policy_net
from src.rl.training.loop import train_rl_agent
from src.utils.data_loader import load_bulk_corridor_data, load_bulk_segment_data
from src.utils.preprocessing import TrafficScaler


def _parse_corridor_ids(raw_value: str | None) -> list[int]:
    if not raw_value:
        return [646713380690000556]
    parsed: list[int] = []
    for part in raw_value.split(","):
        value = part.strip()
        if not value:
            continue
        parsed.append(int(value))
    if not parsed:
        raise ValueError("RL_CORRIDOR_IDS không hợp lệ: phải chứa ít nhất một corridor_id")
    return parsed


def _load_rl_dataframe(
    corridor_ids: list[int],
    start_date: str,
    end_date: str,
    peak_hours_only: bool,
    max_segments: int | None = None,
) -> pd.DataFrame:
    all_corridors: list[pd.DataFrame] = []
    for corridor_id in corridor_ids:
        if max_segments and max_segments > 0:
            segment_ids = get_segments_in_corridor(corridor_id)
            if segment_ids:
                segment_ids = segment_ids[:max_segments]
            corridor_data = load_bulk_segment_data(
                segment_ids=segment_ids,
                start_date=start_date,
                end_date=end_date,
                peak_hours_only=peak_hours_only,
            )
        else:
            corridor_data = load_bulk_corridor_data(
                corridor_id=corridor_id,
                start_date=start_date,
                end_date=end_date,
                peak_hours_only=peak_hours_only,
            )
        if corridor_data:
            all_corridors.append(pd.concat(corridor_data.values(), ignore_index=True))

    if not all_corridors:
        raise ValueError("Không tải được dữ liệu RL từ các corridor đã cấu hình")

    merged = pd.concat(all_corridors, ignore_index=True)
    merged = merged.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)
    return merged


def _apply_warmstart_transforms(df_rl: pd.DataFrame, artifacts_path: str):
    artifacts = joblib.load(artifacts_path)
    encoders = artifacts["encoders"]
    scaler = artifacts["scaler"]

    transformed = df_rl.copy()
    for col in CATEGORICAL_FEATURE_COLS:
        encoder = encoders[col]
        known_classes = set(encoder.classes_)
        transformed[col] = transformed[col].apply(
            lambda value: value if str(value) in known_classes else encoder.classes_[0]
        )
        transformed[col] = encoder.transform(transformed[col].astype(str))

    transformed = scaler.transform(transformed)
    return transformed, encoders, scaler


def _transform_with_known_artifacts(df_rl: pd.DataFrame, encoders: dict, scaler) -> pd.DataFrame:
    transformed = df_rl.copy()
    for col in CATEGORICAL_FEATURE_COLS:
        encoder = encoders[col]
        known_classes = set(encoder.classes_)
        transformed[col] = transformed[col].apply(
            lambda value: value if str(value) in known_classes else encoder.classes_[0]
        )
        transformed[col] = encoder.transform(transformed[col].astype(str))
    return scaler.transform(transformed)


def _fit_pure_rl_transforms(df_rl: pd.DataFrame):
    transformed = df_rl.copy()
    encoders: dict[str, LabelEncoder] = {}

    for col in CATEGORICAL_FEATURE_COLS:
        encoder = LabelEncoder()
        transformed[col] = transformed[col].astype(str)
        encoder.fit(transformed[col])
        transformed[col] = encoder.transform(transformed[col])
        encoders[col] = encoder

    scaler = TrafficScaler()
    scaler.fit(transformed)
    transformed = scaler.transform(transformed)
    return transformed, encoders, scaler


def _split_train_eval(df_rl: pd.DataFrame, eval_ratio: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = df_rl.copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"])
    split_time = data["timestamp"].quantile(1.0 - eval_ratio)

    train_df = data[data["timestamp"] < split_time].copy()
    eval_df = data[data["timestamp"] >= split_time].copy()

    if train_df.empty or eval_df.empty:
        return data.copy(), data.iloc[0:0].copy()
    return train_df, eval_df


def _dataset_quality_snapshot(dataset: TrafficDataset) -> dict:
    total_rows = len(dataset.df)
    valid_windows = len(dataset)
    approx_possible_windows = max(total_rows - dataset.window_size, 1)
    valid_ratio = float(valid_windows / approx_possible_windows)

    return {
        "rows": int(total_rows),
        "valid_windows": int(valid_windows),
        "approx_possible_windows": int(approx_possible_windows),
        "valid_window_ratio": valid_ratio,
    }


def _build_reward_class_weights(train_dataset: TrafficDataset) -> np.ndarray:
    targets = train_dataset.get_training_targets()
    counts = np.bincount(targets, minlength=6).astype(np.float64)
    non_zero = counts[counts > 0]
    if non_zero.size == 0:
        return np.ones(6, dtype=np.float32)

    max_count = float(non_zero.max())
    weights = np.ones(6, dtype=np.float64)
    for cls in range(6):
        n = counts[cls]
        if n > 0:
            # sqrt re-weighting keeps rewards stable while still boosting minority classes.
            weights[cls] = np.sqrt(max_count / float(n))

    weights = np.clip(weights, 1.0, 4.0)
    return weights.astype(np.float32)


def _resolve_torch_device(requested_device: str | None) -> torch.device:
    requested = (requested_device or "auto").strip().lower()
    if requested in {"auto", ""}:
        return torch.device(
            "cuda"
            if torch.cuda.is_available()
            else "mps"
            if torch.backends.mps.is_available()
            else "cpu"
        )

    if requested == "cuda":
        if torch.cuda.is_available():
            return torch.device("cuda")
        print("⚠️ RL_DEVICE=cuda nhưng CUDA không khả dụng. Fallback về CPU.")
        return torch.device("cpu")

    if requested == "mps":
        if torch.backends.mps.is_available():
            return torch.device("mps")
        print("⚠️ RL_DEVICE=mps nhưng MPS không khả dụng. Fallback về CPU.")
        return torch.device("cpu")

    if requested == "cpu":
        return torch.device("cpu")

    print(f"⚠️ RL_DEVICE={requested!r} không hợp lệ. Dùng auto.")
    return torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "mps"
        if torch.backends.mps.is_available()
        else "cpu"
    )


def run_rl_training(mode: str) -> None:
    if mode not in {"warmstart", "pure"}:
        raise ValueError(f"mode không hợp lệ: {mode}")

    start_date = os.getenv("RL_START_DATE", "2026-03-20")
    end_date = os.getenv("RL_END_DATE", "2026-04-08")
    corridor_ids = _parse_corridor_ids(os.getenv("RL_CORRIDOR_IDS"))
    # Default ON: active-hour filtering keeps sequence continuity higher for 15-minute windows.
    peak_hours_only = os.getenv("RL_PEAK_HOURS_ONLY", "1") == "1"
    batch_size = int(os.getenv("RL_BATCH_SIZE", "64"))
    episodes = int(os.getenv("RL_EPISODES", "20"))
    max_steps_per_episode = int(os.getenv("RL_MAX_STEPS_PER_EPISODE", "10000"))
    window_size = int(os.getenv("RL_WINDOW_SIZE", "12"))
    eval_ratio = float(os.getenv("RL_EVAL_RATIO", "0.2"))
    seed = int(os.getenv("RL_SEED", "42"))
    max_segments_env = os.getenv("RL_MAX_SEGMENTS", "0")
    max_segments = int(max_segments_env) if max_segments_env else 0
    requested_device = os.getenv("RL_DEVICE", "auto")
    gamma = float(os.getenv("RL_GAMMA", "0.99"))
    epsilon_start = float(os.getenv("RL_EPSILON_START", "1.0"))
    epsilon_min_default = "0.10" if mode == "pure" else "0.05"
    epsilon_decay_default = "0.995" if mode == "pure" else "0.97"
    learning_rate_default = "0.0002" if mode == "pure" else "0.00005"
    warmup_steps_default = "5000" if mode == "pure" else "2000"
    replay_capacity_default = "200000" if mode == "pure" else "100000"
    use_class_aware_reward_default = "1" if mode == "pure" else "0"

    epsilon_min = float(os.getenv("RL_EPSILON_MIN", epsilon_min_default))
    epsilon_decay = float(os.getenv("RL_EPSILON_DECAY", epsilon_decay_default))
    learning_rate = float(os.getenv("RL_LEARNING_RATE", learning_rate_default))
    warmup_steps = int(os.getenv("RL_WARMUP_STEPS", warmup_steps_default))
    replay_capacity = int(os.getenv("RL_REPLAY_CAPACITY", replay_capacity_default))
    target_update = int(os.getenv("RL_TARGET_UPDATE", "10"))
    early_stop_patience = int(os.getenv("RL_EARLY_STOP_PATIENCE", "0"))
    early_stop_min_delta = float(os.getenv("RL_EARLY_STOP_MIN_DELTA", "0.0"))
    early_stop_eval_interval = int(os.getenv("RL_EARLY_STOP_EVAL_INTERVAL", "1"))
    early_stop_warmup_episodes = int(os.getenv("RL_EARLY_STOP_WARMUP_EPISODES", "0"))
    use_double_dqn = os.getenv("RL_USE_DOUBLE_DQN", "1") == "1"
    use_class_aware_reward = os.getenv("RL_USE_CLASS_AWARE_REWARD", use_class_aware_reward_default) == "1"
    reward_scale = float(os.getenv("RL_REWARD_SCALE", "1.0"))
    reward_clip = float(os.getenv("RL_REWARD_CLIP", "30.0"))
    run_id = os.getenv("RL_RUN_ID", f"{mode}_seed{seed}")
    checkpoint_path = os.getenv("RL_CHECKPOINT_PATH", str(get_rl_checkpoint_path(mode=mode, run_id=run_id)))

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

    print(f"--- RL TRAINING MODE: {mode.upper()} ---")
    print(
        f"📦 Config | corridors={corridor_ids} | start={start_date} | end={end_date} | "
        f"peak_hours_only={peak_hours_only} | episodes={episodes} | batch_size={batch_size} | "
        f"eval_ratio={eval_ratio} | seed={seed} | max_segments={max_segments} | max_steps={max_steps_per_episode} | "
        f"checkpoint={checkpoint_path}"
    )
    print(f"🖥️ Requested device: {requested_device}")
    if early_stop_patience > 0:
        print(
            f"🛑 Early-stop enabled | patience={early_stop_patience} | min_delta={early_stop_min_delta} | "
            f"eval_interval={early_stop_eval_interval} | warmup_episodes={early_stop_warmup_episodes}"
        )
    if not peak_hours_only:
        print(
            "⚠️ RL_PEAK_HOURS_ONLY=0: đang train full-day, có thể làm giảm continuity/valid windows "
            "khi dữ liệu ngoài active-hour bị thưa."
        )

    print("⏳ Đang kéo dữ liệu Sàn đấu...")
    df_rl = _load_rl_dataframe(
        corridor_ids=corridor_ids,
        start_date=start_date,
        end_date=end_date,
        peak_hours_only=peak_hours_only,
        max_segments=max_segments,
    )

    train_raw, eval_raw = _split_train_eval(df_rl, eval_ratio=eval_ratio)
    print(
        f"🧱 Temporal split | train_rows={len(train_raw)} | eval_rows={len(eval_raw)} | "
        f"train_ts=[{train_raw['timestamp'].min() if not train_raw.empty else 'NA'} -> {train_raw['timestamp'].max() if not train_raw.empty else 'NA'}] | "
        f"eval_ts=[{eval_raw['timestamp'].min() if not eval_raw.empty else 'NA'} -> {eval_raw['timestamp'].max() if not eval_raw.empty else 'NA'}]"
    )

    if mode == "warmstart":
        artifacts_path = os.getenv("RL_ARTIFACTS_PATH", str(get_ml_preprocessing_path()))
        pretrained_model_path = os.getenv("RL_PRETRAINED_MODEL_PATH", str(get_ml_checkpoint_path()))

        print(f"📥 Đang nạp artifacts warmstart từ: {artifacts_path}")
        train_scaled, encoders, scaler = _apply_warmstart_transforms(train_raw, artifacts_path)
        eval_scaled = _transform_with_known_artifacts(eval_raw, encoders, scaler) if not eval_raw.empty else eval_raw
        model_path = pretrained_model_path
    else:
        pure_artifacts_path = os.getenv("RL_PURE_ARTIFACTS_PATH", str(get_rl_preprocessing_artifacts_path(mode="pure", run_id=run_id)))

        print("🧪 Đang fit encoder/scaler trực tiếp từ DW ground-truth cho pure RL...")
        train_scaled, encoders, scaler = _fit_pure_rl_transforms(train_raw)
        eval_scaled = _transform_with_known_artifacts(eval_raw, encoders, scaler) if not eval_raw.empty else eval_raw
        joblib.dump({"encoders": encoders, "scaler": scaler}, pure_artifacts_path)
        print(f"💾 Đã lưu artifacts pure RL vào: {pure_artifacts_path}")
        model_path = None

    train_dataset = TrafficDataset(train_scaled, window_size=window_size)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=False)
    eval_dataset = TrafficDataset(eval_scaled, window_size=window_size) if not eval_raw.empty else None
    eval_loader = DataLoader(eval_dataset, batch_size=batch_size, shuffle=False) if eval_dataset is not None else None

    train_snapshot = _dataset_quality_snapshot(train_dataset)
    print(
        f"📈 Train window quality | rows={train_snapshot['rows']} | valid_windows={train_snapshot['valid_windows']} | "
        f"valid_ratio={train_snapshot['valid_window_ratio']:.4f}"
    )
    if eval_dataset is not None:
        eval_snapshot = _dataset_quality_snapshot(eval_dataset)
        print(
            f"📉 Eval window quality  | rows={eval_snapshot['rows']} | valid_windows={eval_snapshot['valid_windows']} | "
            f"valid_ratio={eval_snapshot['valid_window_ratio']:.4f}"
        )
    else:
        eval_snapshot = {"rows": 0, "valid_windows": 0, "approx_possible_windows": 0, "valid_window_ratio": 0.0}

    device = _resolve_torch_device(requested_device)
    print(f"💻 Thiết bị xử lý: {str(device).upper()}")
    print(f"✅ Đã tạo môi trường train với {len(train_dataset)} state hợp lệ")

    reward_class_weights = None
    if use_class_aware_reward:
        reward_class_weights = _build_reward_class_weights(train_dataset)
        print(f"🎯 Class-aware reward weights: {np.round(reward_class_weights, 3)}")

    env = TrafficForecastingEnv(
        dataloader=train_loader,
        device=device,
        class_weights=reward_class_weights,
        reward_scale=reward_scale,
        reward_clip=reward_clip,
    )

    vocab_sizes = {col: len(encoder.classes_) for col, encoder in encoders.items()}
    agent = DQNAgent(
        vocab_sizes=vocab_sizes,
        model_path=model_path,
        device=device,
        checkpoint_path=checkpoint_path,
        gamma=gamma,
        epsilon_start=epsilon_start,
        epsilon_min=epsilon_min,
        epsilon_decay=epsilon_decay,
        batch_size=batch_size,
        target_update=target_update,
        replay_capacity=replay_capacity,
        learning_rate=learning_rate,
        warmup_steps=warmup_steps,
        use_double_dqn=use_double_dqn,
    )

    train_eval_fn = None
    if eval_loader is not None and len(eval_dataset) > 0 and early_stop_patience > 0:
        print("🧪 Early-stop sẽ theo dõi eval_macro_f1 trên holdout split trong lúc train.")

        def _eval_macro_f1_snapshot() -> dict:
            return evaluate_policy_net(agent.policy_net, eval_loader, device=device)

        train_eval_fn = _eval_macro_f1_snapshot
    elif early_stop_patience > 0:
        print("⚠️ Early-stop bị tắt vì eval split không đủ valid windows để tính macro_f1.")

    history = train_rl_agent(
        env=env,
        agent=agent,
        num_episodes=episodes,
        max_steps_per_episode=max_steps_per_episode,
        eval_fn=train_eval_fn,
        early_stop_patience=early_stop_patience,
        early_stop_min_delta=early_stop_min_delta,
        early_stop_eval_interval=early_stop_eval_interval,
        early_stop_warmup_episodes=early_stop_warmup_episodes,
    )

    eval_summary = {}
    if eval_loader is not None and len(eval_dataset) > 0:
        print("🧪 Đang đánh giá policy trên holdout split...")
        eval_summary = evaluate_policy_net(agent.policy_net, eval_loader, device=device)
        print(
            f"✅ Eval | samples={eval_summary.get('num_samples', 0)} | "
            f"acc={eval_summary.get('accuracy', 0.0):.4f} | "
            f"macro_f1={eval_summary.get('macro_f1', 0.0):.4f} | "
            f"recall[3-5]={eval_summary.get('minority_recall_35', 0.0):.4f}"
        )
    else:
        print("⚠️ Bỏ qua holdout evaluation vì eval split không đủ valid windows.")

    history_path = os.getenv("RL_HISTORY_OUT", str(get_rl_history_path(mode=mode, run_id=run_id)))
    joblib.dump(history, history_path)
    print(f"📝 Đã lưu training history vào: {history_path}")

    metrics_out = os.getenv("RL_METRICS_OUT", str(get_rl_metrics_path(mode=mode, run_id=run_id)))
    payload = {
        "mode": mode,
        "config": {
            "corridor_ids": corridor_ids,
            "start_date": start_date,
            "end_date": end_date,
            "peak_hours_only": peak_hours_only,
            "batch_size": batch_size,
            "episodes": episodes,
            "window_size": window_size,
            "eval_ratio": eval_ratio,
            "seed": seed,
            "run_id": run_id,
            "max_segments": max_segments,
            "checkpoint_path": checkpoint_path,
            "requested_device": requested_device,
            "resolved_device": str(device),
            "early_stop_patience": early_stop_patience,
            "early_stop_min_delta": early_stop_min_delta,
            "early_stop_eval_interval": early_stop_eval_interval,
            "early_stop_warmup_episodes": early_stop_warmup_episodes,
        },
        "train_history": {
            "episode_rewards": history.get("episode_rewards", []),
            "avg_losses": history.get("avg_losses", []),
            "epsilons": history.get("epsilons", []),
            "minority_recall_35": history.get("minority_recall_35", []),
            "eval_macro_f1": history.get("eval_macro_f1", []),
            "eval_events": history.get("eval_events", []),
        },
        "data_quality": {
            "train": train_snapshot,
            "eval": eval_snapshot,
        },
        "final_summary": history.get("final_summary", {}),
        "eval_summary": eval_summary,
    }
    with open(metrics_out, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2)
    print(f"📊 Đã lưu RL metrics vào: {metrics_out}")


def resolve_mode(default_mode: str = "warmstart") -> str:
    mode = os.getenv("RL_MODE", default_mode).strip().lower()
    if mode not in {"warmstart", "pure"}:
        raise ValueError("RL_MODE phải là 'warmstart' hoặc 'pure'")
    return mode
