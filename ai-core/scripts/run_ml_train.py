"""Manual training runner for the supervised ML pipeline."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

import joblib
import numpy as np
import pandas as pd
import torch

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.data.dataset import prepare_dataloaders
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_metrics_path, get_ml_preprocessing_path
from src.ml.models.traffic_model import TrafficCongestionModel
from src.ml.training.loop import train_model
from src.ml.feature_contract import NUM_CLASSES, TARGET_COL, WINDOW_STEP_MINUTES
from src.features.sliding_window import find_valid_window_starts
from src.utils.data_loader import load_bulk_corridor_data


PREDICTION_HORIZON_MINUTES = int(os.getenv("ML_PREDICTION_HORIZON_MINUTES", "15"))  # Supported: 15 or 30
if PREDICTION_HORIZON_MINUTES not in (15, 30):
    raise ValueError("PREDICTION_HORIZON_MINUTES chỉ được phép là 15 hoặc 30")

TARGET_OFFSET_STEPS = PREDICTION_HORIZON_MINUTES // WINDOW_STEP_MINUTES
RUN_ID = os.getenv("ML_RUN_ID", f"manual_h{PREDICTION_HORIZON_MINUTES}")
CHECKPOINT_PATH = str(get_ml_checkpoint_path(run_id=RUN_ID))
PREPROCESSING_OUT = str(get_ml_preprocessing_path(run_id=RUN_ID))
METRICS_OUT = str(get_ml_metrics_path(run_id=RUN_ID))

USE_WEIGHTED_SAMPLER = False
USE_CLASS_WEIGHTS = True
CLASS_WEIGHT_CLIP_MIN = 0.8
CLASS_WEIGHT_CLIP_MAX = 1.8
TRAIN_EPOCHS = 35
LEARNING_RATE = 0.001
PATIENCE = 12
BATCH_SIZE = 256
LOSS_TYPE = "ce"
FOCAL_GAMMA = 2.0
CLASS_BALANCED_BETA = 0.9999
LABEL_SMOOTHING = 0.05
WEIGHT_DECAY = 0.0001
USE_LR_SCHEDULER = True
SCHEDULER_PATIENCE = 2
SCHEDULER_FACTOR = 0.5
DROPOUT_RATE = 0.2
# Toggle trực tiếp trong code: True = bật, False = tắt
USE_WINDOW_BALANCING = True

CORRIDOR_IDS = [
    136550177913819656,
    392537437542429252,
    646713380690000556,
    647577676530405923,
    988709510142577156,
    1100735735503891924,
]
START_DATE = "2026-03-25"
END_DATE = "2026-04-16"


def _balance_majority_windows(
    df: pd.DataFrame,
    window_size: int = 12,
    target_offset_steps: int = 1,
    seed: int = 42,
) -> tuple[pd.DataFrame, dict]:
    if df.empty:
        return df, {"applied": False, "reason": "empty_df"}

    ordered = df.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)
    timestamps = pd.to_datetime(ordered["timestamp"]).to_numpy()
    segment_keys = ordered["segment_key"].to_numpy()
    targets = ordered[TARGET_COL].clip(0, NUM_CLASSES - 1).astype(np.int64).to_numpy()

    continuity_window_size = window_size + target_offset_steps - 1
    valid_starts = find_valid_window_starts(
        timestamps=timestamps,
        segment_keys=segment_keys,
        window_size=continuity_window_size,
        step_minutes=WINDOW_STEP_MINUTES,
    )
    if not valid_starts:
        return ordered, {"applied": False, "reason": "no_valid_windows"}

    starts = np.asarray(valid_starts, dtype=np.int64)
    target_indices = starts + window_size + target_offset_steps - 1
    labels = targets[target_indices]
    counts = np.bincount(labels, minlength=NUM_CLASSES).astype(np.int64)

    congested_anchor = int(counts[3])
    if congested_anchor <= 0:
        return ordered, {"applied": False, "reason": "no_class3_windows", "before_window_counts": counts.tolist()}

    target_counts = counts.astype(np.float64)
    target_counts[0] = min(float(counts[0]), float(3.0 * congested_anchor))
    target_counts[1] = min(float(counts[1]), float(3.5 * congested_anchor))
    target_counts[2] = min(float(counts[2]), float(4.0 * congested_anchor))

    keep_probs = np.ones(NUM_CLASSES, dtype=np.float64)
    for cls in (0, 1, 2):
        if counts[cls] > 0:
            keep_probs[cls] = min(1.0, float(target_counts[cls]) / float(counts[cls]))

    rng = np.random.default_rng(seed)
    kept_starts: list[int] = []
    for idx, start_idx in enumerate(starts):
        label = int(labels[idx])
        if label >= 3 or rng.random() <= float(keep_probs[label]):
            kept_starts.append(int(start_idx))

    if not kept_starts:
        return ordered, {"applied": False, "reason": "all_windows_dropped", "before_window_counts": counts.tolist()}

    row_keep_mask = np.zeros(len(ordered), dtype=bool)
    for start_idx in kept_starts:
        row_keep_mask[start_idx : start_idx + window_size + target_offset_steps] = True

    balanced = ordered.loc[row_keep_mask].copy().reset_index(drop=True)
    balanced_starts = find_valid_window_starts(
        timestamps=pd.to_datetime(balanced["timestamp"]).to_numpy(),
        segment_keys=balanced["segment_key"].to_numpy(),
        window_size=continuity_window_size,
        step_minutes=WINDOW_STEP_MINUTES,
    )
    after_counts = np.zeros(NUM_CLASSES, dtype=np.int64)
    if balanced_starts:
        b_targets = balanced[TARGET_COL].clip(0, NUM_CLASSES - 1).astype(np.int64).to_numpy()
        b_target_indices = np.asarray(balanced_starts, dtype=np.int64) + window_size + target_offset_steps - 1
        after_counts = np.bincount(b_targets[b_target_indices], minlength=NUM_CLASSES).astype(np.int64)

    stats = {
        "applied": True,
        "rule": "Anchor class3 (D): T0<=3.0*C3, T1<=3.5*C3, T2<=4.0*C3, keep labels >=3",
        "before_window_counts": counts.tolist(),
        "after_window_counts": after_counts.tolist(),
        "keep_probs": [float(round(v, 4)) for v in keep_probs.tolist()],
        "rows_before": int(len(ordered)),
        "rows_after": int(len(balanced)),
    }
    return balanced, stats


def main() -> None:
    print("--- KHỞI ĐỘNG HUẤN LUYỆN TOÀN TẬP TRÊN 6 CORRIDORS ---")

    print(
        f"🧪 Run={RUN_ID} | weighted_sampler={USE_WEIGHTED_SAMPLER} | "
        f"class_weights={USE_CLASS_WEIGHTS} | clip=[{CLASS_WEIGHT_CLIP_MIN}, {CLASS_WEIGHT_CLIP_MAX}] | "
        f"epochs={TRAIN_EPOCHS} | lr={LEARNING_RATE} | batch_size={BATCH_SIZE} | patience={PATIENCE} | "
        f"horizon={PREDICTION_HORIZON_MINUTES}m | "
        f"loss={LOSS_TYPE} | dropout={DROPOUT_RATE} | weight_decay={WEIGHT_DECAY} | "
        f"label_smoothing={LABEL_SMOOTHING} | lr_scheduler={USE_LR_SCHEDULER} | "
        f"window_balancing={USE_WINDOW_BALANCING} | "
        f"ckpt={CHECKPOINT_PATH}"
    )

    all_segments_data = []

    print(f"🌍 BẮT ĐẦU KÉO DỮ LIỆU TỪ {len(CORRIDOR_IDS)} CORRIDORS...")
    for corridor_id in CORRIDOR_IDS:
        print(f"\n👉 Đang truy xuất Corridor ID: {corridor_id}")
        corridor_data = load_bulk_corridor_data(
            corridor_id=corridor_id,
            start_date=START_DATE,
            end_date=END_DATE,
            peak_hours_only=True,
        )

        if corridor_data:
            df_corridor = pd.concat(corridor_data.values(), ignore_index=True)
            all_segments_data.append(df_corridor)

    if not all_segments_data:
        print("❌ Không lấy được dữ liệu nào. Hãy kiểm tra lại Database hoặc Thời gian.")
        return

    df_master = pd.concat(all_segments_data, ignore_index=True)
    df_master = df_master.sort_values(by=["segment_key", "timestamp"]).reset_index(drop=True)

    balancing_stats = {"applied": False, "reason": "disabled"}
    if USE_WINDOW_BALANCING:
        print("⚖️ Applying window-level majority undersampling on supervised dataset...")
        df_master, balancing_stats = _balance_majority_windows(
            df_master,
            window_size=12,
            target_offset_steps=TARGET_OFFSET_STEPS,
            seed=42,
        )
        if balancing_stats.get("applied"):
            print(
                "✅ Window balancing applied | "
                f"rows: {balancing_stats.get('rows_before')} -> {balancing_stats.get('rows_after')} | "
                f"windows: {sum(balancing_stats.get('before_window_counts', []))} -> {sum(balancing_stats.get('after_window_counts', []))}"
            )
            print(f"📉 Window class counts before: {balancing_stats.get('before_window_counts')}")
            print(f"📈 Window class counts after : {balancing_stats.get('after_window_counts')}")
            print(f"🎛️ Keep probs [0..{NUM_CLASSES - 1}]: {balancing_stats.get('keep_probs')}")
        else:
            print(f"⚠️ Window balancing skipped: {balancing_stats.get('reason')}")

    print(f"\n✅ ĐÃ TẢI THÀNH CÔNG SIÊU TẬP DỮ LIỆU: {df_master.shape[0]} dòng.")
    print("⏳ Đang tính toán DataLoaders (Quá trình mã hóa và scale có thể mất vài phút)...")

    train_loader, val_loader, scaler, encoders = prepare_dataloaders(
        df_master,
        train_ratio=0.8,
        batch_size=BATCH_SIZE,
        window_size=12,
        target_offset_steps=TARGET_OFFSET_STEPS,
        use_weighted_sampler=USE_WEIGHTED_SAMPLER,
    )

    print("\n💾 Đang xuất các bộ biến đổi (Scaler & Encoders)...")
    artifacts = {
        "scaler": scaler,
        "encoders": encoders,
    }
    joblib.dump(artifacts, PREPROCESSING_OUT)
    print(f"✅ Đã xuất preprocessing artifacts: {PREPROCESSING_OUT}")

    vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}
    model = TrafficCongestionModel(vocab_sizes=vocab_sizes, dropout_rate=DROPOUT_RATE)

    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

    history, summary = train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        train_dataset=train_loader.dataset,
        epochs=TRAIN_EPOCHS,
        learning_rate=LEARNING_RATE,
        device=device,
        patience=PATIENCE,
        use_class_weights=USE_CLASS_WEIGHTS,
        class_weight_clip_min=CLASS_WEIGHT_CLIP_MIN,
        class_weight_clip_max=CLASS_WEIGHT_CLIP_MAX,
        loss_type=LOSS_TYPE,
        focal_gamma=FOCAL_GAMMA,
        class_balanced_beta=CLASS_BALANCED_BETA,
        label_smoothing=LABEL_SMOOTHING,
        weight_decay=WEIGHT_DECAY,
        use_lr_scheduler=USE_LR_SCHEDULER,
        scheduler_patience=SCHEDULER_PATIENCE,
        scheduler_factor=SCHEDULER_FACTOR,
        checkpoint_path=CHECKPOINT_PATH,
    )

    if METRICS_OUT:
        # Build comprehensive metrics breakdown
        default_class_names = {
            0: "A_Free",
            1: "B_Stable",
            2: "C_Dense",
            3: "D_HighCongestion",
        }
        class_names = {idx: default_class_names.get(idx, f"Class_{idx}") for idx in range(NUM_CLASSES)}
        
        # Per-class history at best epoch
        best_epoch_idx = summary["best_epoch"] - 1
        per_class_at_best = {}
        for cls_idx in range(NUM_CLASSES):
            per_class_at_best[f"class_{cls_idx}"] = {
                "name": class_names[cls_idx],
                "recall": history["per_class_recall"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_recall"][cls_idx]) else 0.0,
                "precision": history["per_class_precision"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_precision"][cls_idx]) else 0.0,
                "f1": history["per_class_f1"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_f1"][cls_idx]) else 0.0,
            }
        
        # Per-class trajectory (all epochs)
        per_class_trajectory = {}
        for cls_idx in range(NUM_CLASSES):
            per_class_trajectory[f"class_{cls_idx}"] = {
                "name": class_names[cls_idx],
                "recall_history": history["per_class_recall"][cls_idx],
                "precision_history": history["per_class_precision"][cls_idx],
                "f1_history": history["per_class_f1"][cls_idx],
            }
        
        out_payload = {
            "run_id": RUN_ID,
            "config": {
                "use_weighted_sampler": USE_WEIGHTED_SAMPLER,
                "use_class_weights": USE_CLASS_WEIGHTS,
                "class_weight_clip_min": CLASS_WEIGHT_CLIP_MIN,
                "class_weight_clip_max": CLASS_WEIGHT_CLIP_MAX,
                "loss_type": LOSS_TYPE,
                "focal_gamma": FOCAL_GAMMA,
                "class_balanced_beta": CLASS_BALANCED_BETA,
                "label_smoothing": LABEL_SMOOTHING,
                "weight_decay": WEIGHT_DECAY,
                "use_lr_scheduler": USE_LR_SCHEDULER,
                "scheduler_patience": SCHEDULER_PATIENCE,
                "scheduler_factor": SCHEDULER_FACTOR,
                "dropout_rate": DROPOUT_RATE,
                "epochs": TRAIN_EPOCHS,
                "learning_rate": LEARNING_RATE,
                "batch_size": BATCH_SIZE,
                "patience": PATIENCE,
                "use_window_balancing": USE_WINDOW_BALANCING,
                "prediction_horizon_minutes": PREDICTION_HORIZON_MINUTES,
                "target_offset_steps": TARGET_OFFSET_STEPS,
            },
            "summary": summary,
            "window_balancing": balancing_stats,
            "per_class_at_best_epoch": per_class_at_best,
            "per_class_trajectory": per_class_trajectory,
            "confusion_matrix": {
                "labels": list(range(NUM_CLASSES)),
                "matrix": summary.get("confusion_matrix", []),
            },
        }
        with open(METRICS_OUT, "w", encoding="utf-8") as file_handle:
            json.dump(out_payload, file_handle, indent=2)
        print(f"📝 Đã ghi metrics ra {METRICS_OUT}")
        
        # Print structured summary to console
        print("\n" + "="*80)
        print("📊 PER-CLASS METRICS TẠI BEST EPOCH")
        print("="*80)
        for cls_idx in range(NUM_CLASSES):
            metrics = per_class_at_best[f"class_{cls_idx}"]
            marker = "⚠️ " if cls_idx == NUM_CLASSES - 1 else "  "
            print(f"{marker}Class {cls_idx} ({metrics['name']:12s}): Recall={metrics['recall']:.4f} | Prec={metrics['precision']:.4f} | F1={metrics['f1']:.4f}")
        print("="*80)


if __name__ == "__main__":
    main()