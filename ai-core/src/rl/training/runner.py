"""Shared runner utilities for RL training modes."""

from __future__ import annotations

import os
import json
import random
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import pandas as pd
import numpy as np
import torch
from sklearn.preprocessing import LabelEncoder
import logging
from torch.utils.data import DataLoader, Subset
from torch.utils.tensorboard import SummaryWriter

from src.features.sliding_window import find_valid_window_starts
from src.ml.data.dataset import TrafficDataset
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_preprocessing_path
from src.ml.feature_contract import CATEGORICAL_FEATURE_COLS, TARGET_COL, WINDOW_STEP_MINUTES, NUM_CLASSES
from src.data_access import get_segments_in_corridor
from src.rl.artifacts import (
    get_rl_checkpoint_path,
    get_rl_history_path,
    get_rl_metrics_path,
    get_rl_preprocessing_artifacts_path,
    get_rl_evaluation_predictions_path,
)
from src.rl.agents.dqn_agent import DQNAgent
from src.rl.environments.traffic_env import TrafficForecastingEnv
from src.rl.inference.evaluator import evaluate_policy_net, get_policy_predictions
from src.rl.training.loop import train_rl_agent
from src.utils.data_loader import load_bulk_corridor_data, load_bulk_segment_data
from src.utils.preprocessing import TrafficScaler

# Setup logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class RLTrainingConfig:
    start_date: str = "2026-03-20"
    end_date: str = "2026-04-08"
    corridor_ids: list[int] = field(default_factory=lambda: [646713380690000556])
    peak_hours_only: bool = True
    batch_size: int = 64
    episodes: int = 20
    max_steps_per_episode: int = 10000
    window_size: int = 12
    eval_ratio: float = 0.2
    seed: int = 42
    max_segments: int = 0
    requested_device: str = "auto"
    gamma: float = 0.99
    epsilon_start: float = 1.0
    epsilon_min: float = 0.10
    epsilon_decay: float = 0.995
    learning_rate: float = 0.0002
    warmup_steps: int = 5000
    replay_capacity: int = 200000
    target_update: int = 10
    early_stop_patience: int = 0
    early_stop_min_delta: float = 0.0
    early_stop_eval_interval: int = 1
    early_stop_warmup_episodes: int = 0
    use_double_dqn: bool = True
    use_class_aware_reward: bool = True
    use_window_balancing: bool = False
    use_class_balance_pipeline: bool = False
    class_balance_output_path: str | None = None
    class_balance_report_path: str | None = None
    class_balance_seed: int = 42
    class_balance_synthetic_rows_class4: int = 50_000
    class_balance_synthetic_rows_class5: int = 20_000
    class_balance_enable_ctgan: bool = True
    reward_scale: float = 1.0
    reward_clip: float = 150.0
    run_id: str | None = None
    prediction_horizon_minutes: int = 15
    checkpoint_path: str | None = None
    artifacts_path: str | None = None
    pretrained_model_path: str | None = None
    pure_artifacts_path: str | None = None
    history_path: str | None = None
    metrics_out: str | None = None
    data_path: str | None = None


def _load_default_rl_training_config(mode: str) -> RLTrainingConfig:
    start_date = os.getenv("RL_START_DATE", "2026-03-20")
    end_date = os.getenv("RL_END_DATE", "2026-04-08")
    corridor_ids = _parse_corridor_ids(os.getenv("RL_CORRIDOR_IDS"))
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
    epsilon_min_default = "0.05"
    epsilon_decay_default = "0.96"
    learning_rate_default = "0.00005"
    warmup_steps_default = "2000"
    replay_capacity_default = "150000"
    use_class_aware_reward_default = "1" if mode == "pure" else "0"
    use_window_balancing_default = "1" if mode == "pure" else "0"
    use_class_balance_pipeline_default = "1" if mode == "pure" else "0"

    epsilon_min = float(os.getenv("RL_EPSILON_MIN", "0.05"))
    epsilon_decay = float(os.getenv("RL_EPSILON_DECAY", "0.98"))  # Slower decay for better exploration
    learning_rate = float(os.getenv("RL_LEARNING_RATE", "0.00005")) # Conservative LR
    warmup_steps = int(os.getenv("RL_WARMUP_STEPS", "3000"))
    replay_capacity = int(os.getenv("RL_REPLAY_CAPACITY", "200000"))
    target_update = int(os.getenv("RL_TARGET_UPDATE", "10"))
    early_stop_patience = int(os.getenv("RL_EARLY_STOP_PATIENCE", "15")) # More patient
    early_stop_min_delta = float(os.getenv("RL_EARLY_STOP_MIN_DELTA", "0.001"))
    early_stop_eval_interval = int(os.getenv("RL_EARLY_STOP_EVAL_INTERVAL", "1"))
    early_stop_warmup_episodes = int(os.getenv("RL_EARLY_STOP_WARMUP_EPISODES", "25"))
    use_double_dqn = os.getenv("RL_USE_DOUBLE_DQN", "1") == "1"
    use_class_aware_reward = os.getenv("RL_USE_CLASS_AWARE_REWARD", "1") == "1"
    use_window_balancing = os.getenv("RL_USE_WINDOW_BALANCING", "1") == "1"
    use_class_balance_pipeline = os.getenv("RL_USE_CLASS_BALANCE_PIPELINE", "1") == "1"
    class_balance_output_path = os.getenv("RL_CLASS_BALANCE_OUT")
    class_balance_report_path = os.getenv("RL_CLASS_BALANCE_REPORT")
    class_balance_seed = int(os.getenv("RL_CLASS_BALANCE_SEED", str(seed)))
    class_balance_synthetic_rows_class4 = int(os.getenv("RL_CLASS_BALANCE_SYNTHETIC_ROWS_CLASS4", "50000"))
    class_balance_synthetic_rows_class5 = int(os.getenv("RL_CLASS_BALANCE_SYNTHETIC_ROWS_CLASS5", "20000"))
    class_balance_enable_ctgan = os.getenv("RL_CLASS_BALANCE_ENABLE_CTGAN", "1") == "1"
    reward_scale = float(os.getenv("RL_REWARD_SCALE", "1.0"))
    reward_clip = float(os.getenv("RL_REWARD_CLIP", "150.0"))
    prediction_horizon_minutes = int(os.getenv("RL_PREDICTION_HORIZON_MINUTES", "15"))
    run_id = os.getenv("RL_RUN_ID", f"{mode}_seed{seed}_h{prediction_horizon_minutes}")

    checkpoint_path = os.getenv("RL_CHECKPOINT_PATH")
    artifacts_path = os.getenv("RL_ARTIFACTS_PATH")
    pretrained_model_path = os.getenv("RL_PRETRAINED_MODEL_PATH")
    pure_artifacts_path = os.getenv("RL_PURE_ARTIFACTS_PATH")
    history_path = os.getenv("RL_HISTORY_OUT")
    metrics_out = os.getenv("RL_METRICS_OUT")
    data_path = os.getenv("RL_DATA_PATH")

    return RLTrainingConfig(
        start_date=start_date,
        end_date=end_date,
        corridor_ids=corridor_ids,
        peak_hours_only=peak_hours_only,
        batch_size=batch_size,
        episodes=episodes,
        max_steps_per_episode=max_steps_per_episode,
        window_size=window_size,
        eval_ratio=eval_ratio,
        seed=seed,
        max_segments=max_segments,
        requested_device=requested_device,
        gamma=gamma,
        epsilon_start=epsilon_start,
        epsilon_min=epsilon_min,
        epsilon_decay=epsilon_decay,
        learning_rate=learning_rate,
        warmup_steps=warmup_steps,
        replay_capacity=replay_capacity,
        target_update=target_update,
        early_stop_patience=early_stop_patience,
        early_stop_min_delta=early_stop_min_delta,
        early_stop_eval_interval=early_stop_eval_interval,
        early_stop_warmup_episodes=early_stop_warmup_episodes,
        use_double_dqn=use_double_dqn,
        use_class_aware_reward=use_class_aware_reward,
        use_window_balancing=use_window_balancing,
        use_class_balance_pipeline=use_class_balance_pipeline,
        class_balance_output_path=class_balance_output_path,
        class_balance_report_path=class_balance_report_path,
        class_balance_seed=class_balance_seed,
        class_balance_synthetic_rows_class4=class_balance_synthetic_rows_class4,
        class_balance_synthetic_rows_class5=class_balance_synthetic_rows_class5,
        class_balance_enable_ctgan=class_balance_enable_ctgan,
        reward_scale=reward_scale,
        reward_clip=reward_clip,
        run_id=run_id,
        prediction_horizon_minutes=prediction_horizon_minutes,
        checkpoint_path=checkpoint_path,
        artifacts_path=artifacts_path,
        pretrained_model_path=pretrained_model_path,
        pure_artifacts_path=pure_artifacts_path,
        history_path=history_path,
        metrics_out=metrics_out,
        data_path=data_path,
    )


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
    data_path: str | None = None,
) -> pd.DataFrame:
    if data_path and os.path.exists(data_path):
        print(f"📦 Loading RL data from parquet: {data_path}")
        df = pd.read_parquet(data_path)
        return df

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


def _get_window_split_indices(
    dataset: TrafficDataset, train_ratio: float
) -> tuple[np.ndarray, np.ndarray, pd.Timestamp]:
    """
    Performs leak-proof chronological split at window level.
    Matches the logic in src/ml/data/dataset.py:prepare_dataloaders.
    """
    if len(dataset) == 0:
        raise ValueError("Cannot split empty dataset")

    # Find timestamps for the target step of each window
    target_indices = [dataset._target_index(idx) for idx in dataset.valid_indices]
    window_timestamps = dataset.timestamps[target_indices]
    sorted_order = np.argsort(window_timestamps)

    split_idx = int(len(sorted_order) * train_ratio)
    train_win_indices = sorted_order[:split_idx]
    val_win_indices = sorted_order[split_idx:]

    # Identify the split timestamp (last timestamp of the training set)
    split_ts = pd.to_datetime(window_timestamps[sorted_order[split_idx - 1]])

    return train_win_indices, val_win_indices, split_ts


def _dataset_quality_snapshot(dataset: TrafficDataset | Subset) -> dict:
    if isinstance(dataset, Subset):
        total_rows = len(dataset.dataset.df)
        valid_windows = len(dataset)
        return {
            "rows": int(total_rows),
            "valid_windows": int(valid_windows),
        }
    
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


def _build_reward_class_weights(train_dataset: TrafficDataset | Subset) -> np.ndarray:
    if isinstance(train_dataset, Subset):
        all_targets = train_dataset.dataset.get_training_targets()
        targets = all_targets[train_dataset.indices]
    else:
        targets = train_dataset.get_training_targets()
        
    counts = np.bincount(targets, minlength=NUM_CLASSES).astype(np.float64)
    if counts[:NUM_CLASSES].sum() == 0:
        return np.ones(NUM_CLASSES, dtype=np.float32)

    # Calculate smooth inverse frequency weights for all classes
    # formula: weight = sqrt(max_count / count)
    weights = np.ones(NUM_CLASSES, dtype=np.float64)
    focus_counts = counts[:NUM_CLASSES]
    focus_max = float(max(focus_counts.max(), 1.0))

    for i in range(NUM_CLASSES):
        if counts[i] > 0:
            # Use smooth inverse frequency with focus on rare classes
            raw_w = (focus_max / float(counts[i])) ** 0.4 
            # Apply a multiplier for severe congestion classes (3, 4, 5)
            # Extra boost for Class 3 (boundary) in V8.0
            if i == 3:
                raw_w *= 1.5
            elif i > 3:
                raw_w *= 1.2
            weights[i] = float(np.clip(raw_w, 1.0, 4.0))
        else:
            weights[i] = 3.0

    return weights.astype(np.float32)


def _resolve_torch_device(requested_device: str | None) -> torch.device:
    requested = (requested_device or "auto").strip().lower()
    if requested in {"auto", ""}:
        return torch.device(
            "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        )
    return torch.device(requested)


def run_rl_training(mode: str, config: RLTrainingConfig | None = None) -> None:
    if mode not in {"warmstart", "pure"}:
        raise ValueError(f"mode không hợp lệ: {mode}")

    config = config or _load_default_rl_training_config(mode)
    start_date, end_date = config.start_date, config.end_date
    corridor_ids = config.corridor_ids
    peak_hours_only = config.peak_hours_only
    batch_size = config.batch_size
    episodes = config.episodes
    max_steps_per_episode = config.max_steps_per_episode
    window_size = config.window_size
    eval_ratio = config.eval_ratio
    seed = config.seed
    max_segments = config.max_segments
    requested_device = config.requested_device
    gamma = config.gamma
    epsilon_start = config.epsilon_start
    epsilon_min = config.epsilon_min
    epsilon_decay = config.epsilon_decay
    learning_rate = config.learning_rate
    warmup_steps = config.warmup_steps
    replay_capacity = config.replay_capacity
    target_update = config.target_update
    early_stop_patience = config.early_stop_patience
    early_stop_min_delta = config.early_stop_min_delta
    early_stop_eval_interval = config.early_stop_eval_interval
    early_stop_warmup_episodes = config.early_stop_warmup_episodes
    use_double_dqn = config.use_double_dqn
    use_class_aware_reward = config.use_class_aware_reward
    reward_scale = config.reward_scale
    reward_clip = config.reward_clip
    prediction_horizon_minutes = int(config.prediction_horizon_minutes)
    target_offset_steps = prediction_horizon_minutes // WINDOW_STEP_MINUTES
    run_id = config.run_id or f"{mode}_seed{seed}_h{prediction_horizon_minutes}"
    checkpoint_path = config.checkpoint_path or str(get_rl_checkpoint_path(mode=mode, run_id=run_id))

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
        f"horizon={prediction_horizon_minutes}m | target_offset_steps={target_offset_steps} | "
        f"checkpoint={checkpoint_path}"
    )

    print("⏳ Đang kéo dữ liệu Sàn đấu...")
    df_rl = _load_rl_dataframe(
        corridor_ids=corridor_ids,
        start_date=start_date,
        end_date=end_date,
        peak_hours_only=peak_hours_only,
        max_segments=max_segments,
        data_path=config.data_path,
    )

    # --- CHRONOLOGICAL WINDOW-LEVEL SPLIT (Sync with Notebook 03) ---
    print(f"⏳ Preparing leack-proof window-level split (ratio={1.0 - eval_ratio:.1f}/{eval_ratio:.1f})...")
    full_raw_dataset = TrafficDataset(df_rl, window_size=window_size, target_offset_steps=target_offset_steps, verbose=False)
    train_indices, eval_indices, split_ts = _get_window_split_indices(full_raw_dataset, train_ratio=(1.0 - eval_ratio))
    print(f"🧱 Window-level split | total_windows={len(full_raw_dataset)} | train={len(train_indices)} | eval={len(eval_indices)} | split_ts={split_ts}")

    # --- TRANSFORMS & DATASETS ---
    if mode == "warmstart":
        artifacts_path = config.artifacts_path or str(get_ml_preprocessing_path())
        pretrained_model_path = config.pretrained_model_path or str(get_ml_checkpoint_path())
        print(f"📥 Loading warmstart artifacts from: {artifacts_path}")
        df_scaled, encoders, scaler = _apply_warmstart_transforms(df_rl, artifacts_path)
        model_path = pretrained_model_path
    else:
        print("🧪 Fitting scaler on training data portion...")
        train_rows = df_rl[pd.to_datetime(df_rl['timestamp']) <= split_ts].copy()
        
        # Simple encoding for pure mode
        df_encoded = df_rl.copy()
        encoders = {}
        for col in CATEGORICAL_FEATURE_COLS:
            if col in df_encoded.columns:
                le = LabelEncoder()
                df_encoded[col] = le.fit_transform(df_encoded[col].astype(str))
                encoders[col] = le
        
        scaler = TrafficScaler()
        scaler.fit(train_rows)
        df_scaled = scaler.transform(df_encoded)
        
        pure_artifacts_path = config.pure_artifacts_path or str(get_rl_preprocessing_artifacts_path(mode="pure", run_id=run_id))
        joblib.dump({"encoders": encoders, "scaler": scaler}, pure_artifacts_path)
        print(f"💾 Saved artifacts to: {pure_artifacts_path}")
        model_path = None

    full_dataset_scaled = TrafficDataset(df_scaled, window_size=window_size, target_offset_steps=target_offset_steps, verbose=True)
    train_dataset = Subset(full_dataset_scaled, train_indices)
    eval_dataset = Subset(full_dataset_scaled, eval_indices)

    # --- LOG CLASS DISTRIBUTION (TRAIN VS VAL) ---
    print("\n📊 PHÂN BỔ CỬA SỔ CHI TIẾT (TRAIN VS VAL):")
    all_targets = full_dataset_scaled.get_training_targets()
    train_targets = all_targets[train_indices]
    eval_targets = all_targets[eval_indices]
    
    train_counts = np.bincount(train_targets, minlength=NUM_CLASSES)
    eval_counts = np.bincount(eval_targets, minlength=NUM_CLASSES)
    
    for cls in range(NUM_CLASSES):
        print(f"  - Class {cls}: Train={train_counts[cls]:>6} | Val={eval_counts[cls]:>6}")
    print("-" * 50)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=False)
    eval_loader = DataLoader(eval_dataset, batch_size=batch_size, shuffle=False)

    # --- DEVICE & ENVIRONMENT ---
    device = _resolve_torch_device(requested_device)
    print(f"💻 Thiết bị xử lý: {str(device).upper()}")
    
    reward_class_weights = None
    if use_class_aware_reward:
        reward_class_weights = _build_reward_class_weights(train_dataset)
        print(f"🎯 Class-aware reward weights: {np.round(reward_class_weights, 3)}")

    env = TrafficForecastingEnv(dataloader=train_loader, device=device, class_weights=reward_class_weights, reward_scale=reward_scale, reward_clip=reward_clip)

    # --- AGENT ---
    vocab_sizes = {col: len(encoder.classes_) for col, encoder in encoders.items()}
    agent = DQNAgent(
        vocab_sizes=vocab_sizes, model_path=model_path, device=device, checkpoint_path=checkpoint_path,
        gamma=gamma, epsilon_start=epsilon_start, epsilon_min=epsilon_min, epsilon_decay=epsilon_decay,
        batch_size=batch_size, target_update=target_update, replay_capacity=replay_capacity,
        learning_rate=learning_rate, warmup_steps=warmup_steps, use_double_dqn=use_double_dqn,
    )

    # --- TRAINING LOOP ---
    tensorboard_log_dir = str(Path(checkpoint_path).resolve().parent / "tensorboard" / run_id)
    writer = SummaryWriter(log_dir=tensorboard_log_dir)

    train_eval_fn = None
    if early_stop_patience > 0:
        def _eval_macro_f1_snapshot() -> dict:
            return evaluate_policy_net(agent.policy_net, eval_loader, device=device)
        train_eval_fn = _eval_macro_f1_snapshot

    history = train_rl_agent(
        env=env, agent=agent, num_episodes=episodes, max_steps_per_episode=max_steps_per_episode,
        eval_fn=train_eval_fn, early_stop_patience=early_stop_patience, early_stop_min_delta=early_stop_min_delta,
        early_stop_eval_interval=early_stop_eval_interval, early_stop_warmup_episodes=early_stop_warmup_episodes,
        writer=writer,
    )

    # --- EVALUATION ---
    eval_summary = evaluate_policy_net(agent.policy_net, eval_loader, device=device)

    # --- EXPORT PREDICTIONS FOR ANALYSIS (Notebook 06) ---
    logger.info("🎬 Exporting evaluation predictions for detailed analysis...")
    eval_df = get_policy_predictions(agent.policy_net, eval_loader, device=device)
    predictions_path = get_rl_evaluation_predictions_path(mode=mode, run_id=run_id)
    eval_df.to_parquet(predictions_path, index=False)
    logger.info(f"📊 Predictions exported to: {predictions_path}")
    print(f"✅ Eval | acc={eval_summary.get('accuracy', 0.0):.4f} | macro_f1={eval_summary.get('macro_f1', 0.0):.4f}")

    # --- SAVE RESULTS ---
    history_path = config.history_path or str(get_rl_history_path(mode=mode, run_id=run_id))
    joblib.dump(history, history_path)
    
    metrics_out = config.metrics_out or str(get_rl_metrics_path(mode=mode, run_id=run_id))
    payload = {
        "mode": mode, "config": vars(config), "train_history": history,
        "data_quality": {"train": _dataset_quality_snapshot(train_dataset), "eval": _dataset_quality_snapshot(eval_dataset)},
        "eval_summary": eval_summary, "final_summary": history.get("final_summary", {}),
    }
    with open(metrics_out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=lambda x: str(x) if isinstance(x, (Path, torch.device)) else x)
    print(f"📊 Đã lưu RL metrics vào: {metrics_out}")

def resolve_mode(default_mode: str = "warmstart") -> str:
    mode = os.getenv("RL_MODE", default_mode).strip().lower()
    if mode not in {"warmstart", "pure"}:
        raise ValueError("RL_MODE phải là 'warmstart' hoặc 'pure'")
    return mode
