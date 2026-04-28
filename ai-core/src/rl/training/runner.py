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
from torch.utils.data import DataLoader
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
)
from src.rl.agents.dqn_agent import DQNAgent
from src.rl.environments.traffic_env import TrafficForecastingEnv
from src.rl.inference.evaluator import evaluate_policy_net
from src.rl.training.loop import train_rl_agent
from src.rl.data_balance import ClassBalanceConfig, build_balanced_dataset
from src.utils.data_loader import load_bulk_corridor_data, load_bulk_segment_data
from src.utils.preprocessing import TrafficScaler


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
    reward_clip: float = 30.0
    run_id: str | None = None
    prediction_horizon_minutes: int = 15
    checkpoint_path: str | None = None
    artifacts_path: str | None = None
    pretrained_model_path: str | None = None
    pure_artifacts_path: str | None = None
    history_path: str | None = None
    metrics_out: str | None = None


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
    epsilon_min_default = "0.10" if mode == "pure" else "0.05"
    epsilon_decay_default = "0.995" if mode == "pure" else "0.97"
    learning_rate_default = "0.0002" if mode == "pure" else "0.00005"
    warmup_steps_default = "5000" if mode == "pure" else "2000"
    replay_capacity_default = "200000" if mode == "pure" else "100000"
    use_class_aware_reward_default = "1" if mode == "pure" else "0"
    use_window_balancing_default = "1" if mode == "pure" else "0"
    use_class_balance_pipeline_default = "1" if mode == "pure" else "0"

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
    use_window_balancing = os.getenv("RL_USE_WINDOW_BALANCING", use_window_balancing_default) == "1"
    use_class_balance_pipeline = os.getenv("RL_USE_CLASS_BALANCE_PIPELINE", use_class_balance_pipeline_default) == "1"
    class_balance_output_path = os.getenv("RL_CLASS_BALANCE_OUT")
    class_balance_report_path = os.getenv("RL_CLASS_BALANCE_REPORT")
    class_balance_seed = int(os.getenv("RL_CLASS_BALANCE_SEED", str(seed)))
    class_balance_synthetic_rows_class4 = int(os.getenv("RL_CLASS_BALANCE_SYNTHETIC_ROWS_CLASS4", "50000"))
    class_balance_synthetic_rows_class5 = int(os.getenv("RL_CLASS_BALANCE_SYNTHETIC_ROWS_CLASS5", "20000"))
    class_balance_enable_ctgan = os.getenv("RL_CLASS_BALANCE_ENABLE_CTGAN", "1") == "1"
    reward_scale = float(os.getenv("RL_REWARD_SCALE", "1.0"))
    reward_clip = float(os.getenv("RL_REWARD_CLIP", "30.0"))
    prediction_horizon_minutes = int(os.getenv("RL_PREDICTION_HORIZON_MINUTES", "15"))
    run_id = os.getenv("RL_RUN_ID", f"{mode}_seed{seed}_h{prediction_horizon_minutes}")

    checkpoint_path = os.getenv("RL_CHECKPOINT_PATH")
    artifacts_path = os.getenv("RL_ARTIFACTS_PATH")
    pretrained_model_path = os.getenv("RL_PRETRAINED_MODEL_PATH")
    pure_artifacts_path = os.getenv("RL_PURE_ARTIFACTS_PATH")
    history_path = os.getenv("RL_HISTORY_OUT")
    metrics_out = os.getenv("RL_METRICS_OUT")

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
    counts = np.bincount(targets, minlength=NUM_CLASSES).astype(np.float64)
    if counts[:NUM_CLASSES].sum() == 0:
        return np.ones(NUM_CLASSES, dtype=np.float32)

    weights = np.ones(NUM_CLASSES, dtype=np.float64)
    focus_counts = counts[:NUM_CLASSES]
    focus_max = float(max(focus_counts.max(), 1.0))

    # Keep classes 0 to NUM_CLASSES-2 close to baseline so the policy preserves stable traffic predictions.
    for i in range(NUM_CLASSES - 1):
        weights[i] = 1.0

    # Last class (NUM_CLASSES-1) is the priority target; make it more attractive without over-boosting the tail.
    if counts[NUM_CLASSES - 1] > 0:
        weights[NUM_CLASSES - 1] = float(np.clip(np.sqrt(focus_max / float(counts[NUM_CLASSES - 1])) * 1.15, 1.6, 2.2))
    else:
        weights[NUM_CLASSES - 1] = 2.0

    weights = np.clip(weights, 0.7, 2.2)
    return weights.astype(np.float32)


def _balance_majority_windows(
    df_train: pd.DataFrame,
    window_size: int,
    target_offset_steps: int,
    seed: int,
) -> tuple[pd.DataFrame, dict]:
    """Apply window-level majority undersampling while preserving 12-step continuity."""
    if df_train.empty:
        return df_train, {"applied": False, "reason": "empty_train"}

    timestamps = pd.to_datetime(df_train["timestamp"]).to_numpy()
    segment_keys = df_train["segment_key"].to_numpy()
    targets = df_train[TARGET_COL].clip(0, NUM_CLASSES - 1).astype(np.int64).to_numpy()

    continuity_window_size = window_size + target_offset_steps - 1
    valid_starts = find_valid_window_starts(
        timestamps=timestamps,
        segment_keys=segment_keys,
        window_size=continuity_window_size,
        step_minutes=WINDOW_STEP_MINUTES,
    )
    if not valid_starts:
        return df_train, {"applied": False, "reason": "no_valid_windows"}

    starts = np.asarray(valid_starts, dtype=np.int64)
    target_indices = starts + window_size + target_offset_steps - 1
    window_labels = targets[target_indices]

    counts = np.bincount(window_labels, minlength=NUM_CLASSES).astype(np.int64)
    minority_class_idx = NUM_CLASSES - 1
    minority_total = int(counts[minority_class_idx])
    if minority_total <= 0:
        return df_train, {
            "applied": False,
            "reason": "no_minority_windows",
            "before_window_counts": counts.tolist(),
        }

    target_counts = counts.copy().astype(np.float64)
    balanced_target = float(2.5 * minority_total)
    for cls in range(minority_class_idx):
        target_counts[cls] = min(float(counts[cls]), balanced_target)

    keep_probs = np.ones(NUM_CLASSES, dtype=np.float64)
    for cls in range(NUM_CLASSES - 1):
        if counts[cls] > 0:
            keep_probs[cls] = min(1.0, float(target_counts[cls]) / float(counts[cls]))

    transitions = np.zeros(len(starts), dtype=bool)
    if len(window_labels) > 1:
        transitions[1:] = window_labels[1:] != window_labels[:-1]
        transitions[:-1] |= window_labels[:-1] != window_labels[1:]

    signature_cols = [
        col
        for col in (
            "traffic_index",
            "current_speed_kmh",
            "delay_seconds",
            "quality_flag",
            "speed_ratio",
            "speed_delta",
            "free_flow_speed_kmh",
            "is_one_way",
            "is_business_hours",
            "is_weekend",
            "time_sin",
            "time_cos",
        )
        if col in df_train.columns
    ]
    signature_arrays: dict[str, np.ndarray] = {}
    for col in signature_cols:
        signature_arrays[col] = pd.to_numeric(df_train[col], errors="coerce").fillna(0.0).to_numpy(dtype=np.float32)

    def _compute_feature_vector(target_idx: int) -> np.ndarray:
        """Extract feature vector for cosine similarity (normalized to [0,1])."""
        vec = np.array(
            [
                float(signature_arrays[col][target_idx])
                for col in signature_cols
            ],
            dtype=np.float32,
        )
        # Normalize to prevent bias from absolute values
        norm = np.linalg.norm(vec)
        return vec / (norm + 1e-8)

    def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity between two normalized vectors."""
        return float(np.dot(vec1, vec2))

    def _is_duplicate_window(target_idx: int, seen_vectors: list[np.ndarray]) -> bool:
        """
        FIX #2: Check for duplicate using cosine similarity > 0.95 (not exact float match).
        This handles float precision issues in dynamic features.
        """
        if not seen_vectors:
            return False
        current_vec = _compute_feature_vector(target_idx)
        for seen_vec in seen_vectors:
            if _cosine_similarity(current_vec, seen_vec) > 0.95:
                return True
        return False

    rng = np.random.default_rng(seed)
    seen_vectors: list[np.ndarray] = []  # Store feature vectors instead of signatures
    kept_starts: list[int] = []
    dropped_duplicates = 0
    dropped_probability = 0

    for idx, start_idx in enumerate(starts):
        target_idx = int(target_indices[idx])
        label = int(window_labels[idx])

        if label >= minority_class_idx:
            kept_starts.append(int(start_idx))
            seen_vectors.append(_compute_feature_vector(target_idx))
            continue

        keep_prob = float(keep_probs[label])
        is_duplicate = _is_duplicate_window(target_idx, seen_vectors)
        
        # FIX #1: Wrap probability before AND after modifiers to prevent overflow > 1.0
        if is_duplicate:
            keep_prob = min(1.0, keep_prob * 0.20)  # Duplicate penalty: reduce by 80%
        if transitions[idx]:
            keep_prob = min(1.0, keep_prob * 1.30)  # Transition bonus: +30% (capped at 1.0)

        if rng.random() <= keep_prob:
            kept_starts.append(int(start_idx))
            seen_vectors.append(_compute_feature_vector(target_idx))
        else:
            if is_duplicate:
                dropped_duplicates += 1
            else:
                dropped_probability += 1

    if not kept_starts:
        return df_train, {
            "applied": False,
            "reason": "all_windows_dropped",
            "before_window_counts": counts.tolist(),
        }

    row_keep_mask = np.zeros(len(df_train), dtype=bool)
    for start_idx in kept_starts:
        row_keep_mask[start_idx : start_idx + window_size + target_offset_steps] = True

    balanced_df = df_train.loc[row_keep_mask].copy().reset_index(drop=True)
    post_valid = find_valid_window_starts(
        timestamps=pd.to_datetime(balanced_df["timestamp"]).to_numpy(),
        segment_keys=balanced_df["segment_key"].to_numpy(),
        window_size=continuity_window_size,
        step_minutes=WINDOW_STEP_MINUTES,
    )
    if not post_valid:
        return df_train, {
            "applied": False,
            "reason": "post_balance_no_valid_windows",
            "before_window_counts": counts.tolist(),
        }

    post_targets = balanced_df[TARGET_COL].clip(0, NUM_CLASSES - 1).astype(np.int64).to_numpy()
    post_target_indices = np.asarray(post_valid, dtype=np.int64) + window_size + target_offset_steps - 1
    after_counts = np.bincount(post_targets[post_target_indices], minlength=NUM_CLASSES).astype(np.int64)

    stats = {
        "applied": True,
        "rule": (
            f"Balanced: each class in [0..{minority_class_idx - 1}] capped at 2.5x class_{minority_class_idx}; "
            f"keep all class_{minority_class_idx} windows"
        ),
        "balance_fix": "Cap all majority classes equally to avoid creating artificial peak class",
        "duplicate_fix": "FIX: Use cosine_similarity > 0.95 instead of exact float comparison",
        "probability_fix": "FIX: Wrap keep_prob with min(1.0, ...) after every modifier",
        "before_window_counts": counts.tolist(),
        "after_window_counts": after_counts.tolist(),
        "keep_probs": [float(round(v, 4)) for v in keep_probs.tolist()],
        "minority_total_windows": minority_total,
        "kept_windows": int(len(kept_starts)),
        "dropped_duplicates": int(dropped_duplicates),
        "dropped_probability": int(dropped_probability),
        "rows_before": int(len(df_train)),
        "rows_after": int(len(balanced_df)),
    }
    return balanced_df, stats


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


def run_rl_training(mode: str, config: RLTrainingConfig | None = None) -> None:
    if mode not in {"warmstart", "pure"}:
        raise ValueError(f"mode không hợp lệ: {mode}")

    config = config or _load_default_rl_training_config(mode)
    # Default ON: active-hour filtering keeps sequence continuity higher for 15-minute windows.
    start_date = config.start_date
    end_date = config.end_date
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
    use_window_balancing = config.use_window_balancing
    use_class_balance_pipeline = config.use_class_balance_pipeline
    reward_scale = config.reward_scale
    reward_clip = config.reward_clip
    prediction_horizon_minutes = int(config.prediction_horizon_minutes)
    if prediction_horizon_minutes not in (15, 30):
        raise ValueError("prediction_horizon_minutes chỉ được phép là 15 hoặc 30")
    if prediction_horizon_minutes % WINDOW_STEP_MINUTES != 0:
        raise ValueError("prediction_horizon_minutes phải chia hết cho WINDOW_STEP_MINUTES")

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

    balance_stats = {"applied": False, "reason": "disabled"}
    class_balance_stats = {"applied": False, "reason": "disabled"}

    if use_class_balance_pipeline:
        print("🧩 Applying full class-balance pipeline (undersample + synthetic oversample + parquet export)...")
        output_path = config.class_balance_output_path or str(Path(get_rl_preprocessing_artifacts_path(mode="pure", run_id=run_id)).with_suffix(".parquet"))
        report_path = config.class_balance_report_path or str(Path(output_path).with_suffix(".json"))
        class_balance_cfg = ClassBalanceConfig(
            random_seed=config.class_balance_seed,
            window_size=window_size,
            synthetic_rows_class4=config.class_balance_synthetic_rows_class4,
            synthetic_rows_class5=config.class_balance_synthetic_rows_class5,
            use_ctgan=config.class_balance_enable_ctgan,
            output_path=output_path,
            report_path=report_path,
        )
        train_raw, class_balance_report = build_balanced_dataset(
            train_raw,
            config=class_balance_cfg,
            output_path=output_path,
            report_path=report_path,
        )
        class_balance_stats = class_balance_report.to_dict()
        print(
            "✅ Class-balance pipeline applied | "
            f"rows: {class_balance_stats.get('stage_counts', {}).get('stage1_rows', 'NA')} -> {len(train_raw)} | "
            f"after_counts={class_balance_stats.get('after_counts')}"
        )
        print(f"💾 Balanced parquet: {class_balance_stats.get('output_path')}")
        if class_balance_stats.get("report_path"):
            print(f"📝 Balance report: {class_balance_stats.get('report_path')}")
    elif mode == "pure" and use_window_balancing:
        print("⚖️ Applying window-level majority undersampling for pure RL train set...")
        train_raw, balance_stats = _balance_majority_windows(
            df_train=train_raw,
            window_size=window_size,
            target_offset_steps=target_offset_steps,
            seed=seed,
        )
        if balance_stats.get("applied"):
            print(
                "✅ Window balancing applied | "
                f"rows: {balance_stats.get('rows_before')} -> {balance_stats.get('rows_after')} | "
                f"windows: {sum(balance_stats.get('before_window_counts', []))} -> {sum(balance_stats.get('after_window_counts', []))}"
            )
            print(
                "📉 Window class counts before: "
                f"{balance_stats.get('before_window_counts')}"
            )
            print(
                "📈 Window class counts after : "
                f"{balance_stats.get('after_window_counts')}"
            )
            print(
                f"🎛️ Keep probs [0..{NUM_CLASSES - 1}]: "
                f"{balance_stats.get('keep_probs')}"
            )
        else:
            print(f"⚠️ Window balancing skipped: {balance_stats.get('reason')}")

    if mode == "warmstart":
        artifacts_path = config.artifacts_path or str(get_ml_preprocessing_path())
        pretrained_model_path = config.pretrained_model_path or str(get_ml_checkpoint_path())

        print(f"📥 Đang nạp artifacts warmstart từ: {artifacts_path}")
        train_scaled, encoders, scaler = _apply_warmstart_transforms(train_raw, artifacts_path)
        eval_scaled = _transform_with_known_artifacts(eval_raw, encoders, scaler) if not eval_raw.empty else eval_raw
        model_path = pretrained_model_path
    else:
        pure_artifacts_path = config.pure_artifacts_path or str(get_rl_preprocessing_artifacts_path(mode="pure", run_id=run_id))

        print("🧪 Đang fit encoder/scaler trực tiếp từ DW ground-truth cho pure RL...")
        train_scaled, encoders, scaler = _fit_pure_rl_transforms(train_raw)
        eval_scaled = _transform_with_known_artifacts(eval_raw, encoders, scaler) if not eval_raw.empty else eval_raw
        joblib.dump({"encoders": encoders, "scaler": scaler}, pure_artifacts_path)
        print(f"💾 Đã lưu artifacts pure RL vào: {pure_artifacts_path}")
        model_path = None

    train_dataset = TrafficDataset(
        train_scaled,
        window_size=window_size,
        target_offset_steps=target_offset_steps,
    )
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=False)
    eval_dataset = (
        TrafficDataset(
            eval_scaled,
            window_size=window_size,
            target_offset_steps=target_offset_steps,
        )
        if not eval_raw.empty
        else None
    )
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

    tensorboard_log_dir = str(Path(checkpoint_path).resolve().parent / "tensorboard" / run_id)
    writer = SummaryWriter(log_dir=tensorboard_log_dir)
    writer.add_text(
        "rl/run/config",
        json.dumps(
            {
                "mode": mode,
                "run_id": run_id,
                "corridor_ids": corridor_ids,
                "start_date": start_date,
                "end_date": end_date,
                "episodes": episodes,
                "batch_size": batch_size,
                "window_size": window_size,
                "prediction_horizon_minutes": prediction_horizon_minutes,
                "target_offset_steps": target_offset_steps,
                "eval_ratio": eval_ratio,
                "use_window_balancing": use_window_balancing,
                    "use_class_balance_pipeline": use_class_balance_pipeline,
                "use_class_aware_reward": use_class_aware_reward,
                "tensorboard_log_dir": tensorboard_log_dir,
            },
            indent=2,
            ensure_ascii=False,
        ),
        0,
    )

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
        print("🧪 Early-stop sẽ theo dõi macro_f1 trên holdout split cho tất cả classes trong lúc train.")

        def _eval_macro_f1_snapshot() -> dict:
            return evaluate_policy_net(agent.policy_net, eval_loader, device=device)

        train_eval_fn = _eval_macro_f1_snapshot
    elif early_stop_patience > 0:
        print("⚠️ Early-stop bị tắt vì eval split không đủ valid windows để tính macro_f1 cho tất cả classes.")

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
        writer=writer,
    )

    eval_summary = {}
    eval_summary_best_checkpoint = {}
    if eval_loader is not None and len(eval_dataset) > 0:
        print("🧪 Đang đánh giá policy trên holdout split...")
        eval_summary = evaluate_policy_net(agent.policy_net, eval_loader, device=device)
        print(
            f"✅ Eval | samples={eval_summary.get('num_samples', 0)} | "
            f"acc={eval_summary.get('accuracy', 0.0):.4f} | "
            f"macro_f1={eval_summary.get('macro_f1', 0.0):.4f}"
        )

        checkpoint_file = Path(checkpoint_path)
        if checkpoint_file.exists():
            print(f"🧪 Đang nạp best checkpoint để đánh giá lại: {checkpoint_path}")
            best_state = torch.load(checkpoint_file, map_location=device)
            agent.policy_net.load_state_dict(best_state)
            eval_summary_best_checkpoint = evaluate_policy_net(agent.policy_net, eval_loader, device=device)
            print(
                f"✅ Best Checkpoint Eval | samples={eval_summary_best_checkpoint.get('num_samples', 0)} | "
                f"acc={eval_summary_best_checkpoint.get('accuracy', 0.0):.4f} | "
                f"macro_f1={eval_summary_best_checkpoint.get('macro_f1', 0.0):.4f}"
            )
        else:
            print(f"⚠️ Không tìm thấy checkpoint để evaluate lại: {checkpoint_path}")
    else:
        print("⚠️ Bỏ qua holdout evaluation vì eval split không đủ valid windows.")

    writer.add_scalar("rl/final/best_reward", float(history.get("final_summary", {}).get("best_reward", 0.0)), 0)
    writer.add_scalar("rl/final/best_eval_macro_f1", float(history.get("final_summary", {}).get("best_eval_macro_f1", 0.0)), 0)
    writer.add_scalar("rl/final/mean_q_value", float(history.get("final_summary", {}).get("mean_q_value", 0.0)), 0)
    writer.add_scalar("rl/final/mean_td_error", float(history.get("final_summary", {}).get("mean_td_error", 0.0)), 0)
    writer.flush()
    writer.close()

    history_path = config.history_path or str(get_rl_history_path(mode=mode, run_id=run_id))
    joblib.dump(history, history_path)
    print(f"📝 Đã lưu training history vào: {history_path}")

    metrics_out = config.metrics_out or str(get_rl_metrics_path(mode=mode, run_id=run_id))
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
            "prediction_horizon_minutes": prediction_horizon_minutes,
            "target_offset_steps": target_offset_steps,
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
            "use_window_balancing": use_window_balancing,
            "use_class_balance_pipeline": use_class_balance_pipeline,
        },
        "train_history": {
            "episode_rewards": history.get("episode_rewards", []),
            "avg_losses": history.get("avg_losses", []),
            "epsilons": history.get("epsilons", []),
            "per_class_recall": history.get("per_class_recall", []),
            "per_class_precision": history.get("per_class_precision", []),
            "per_class_f1": history.get("per_class_f1", []),
            "action_distribution": history.get("action_distribution", []),
            "mean_q_value": history.get("mean_q_value", []),
            "mean_target_q_value": history.get("mean_target_q_value", []),
            "mean_td_error": history.get("mean_td_error", []),
            "reward_breakdown": history.get("reward_breakdown", []),
            "eval_macro_f1": history.get("eval_macro_f1", []),
            "eval_events": history.get("eval_events", []),
        },
        "data_quality": {
            "train": train_snapshot,
            "eval": eval_snapshot,
        },
        "window_balancing": balance_stats,
        "class_balance_pipeline": class_balance_stats,
        "tensorboard_log_dir": tensorboard_log_dir,
        "final_summary": history.get("final_summary", {}),
        "eval_summary": eval_summary,
        "eval_summary_best_checkpoint": eval_summary_best_checkpoint,
    }
    with open(metrics_out, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2)
    print(f"📊 Đã lưu RL metrics vào: {metrics_out}")


def resolve_mode(default_mode: str = "warmstart") -> str:
    mode = os.getenv("RL_MODE", default_mode).strip().lower()
    if mode not in {"warmstart", "pure"}:
        raise ValueError("RL_MODE phải là 'warmstart' hoặc 'pure'")
    return mode
