"""Manual training runner for the supervised ML pipeline."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys

import joblib
import pandas as pd
import torch

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.ml.data.dataset import prepare_dataloaders
from src.ml.artifacts import get_ml_checkpoint_path, get_ml_metrics_path, get_ml_preprocessing_path
from src.ml.models.traffic_model import TrafficCongestionModel
from src.ml.training.loop import train_model
from src.utils.data_loader import load_bulk_corridor_data


def main() -> None:
    print("--- KHỞI ĐỘNG HUẤN LUYỆN TOÀN TẬP TRÊN 6 CORRIDORS ---")

    run_id = os.getenv("RUN_ID", "manual")
    checkpoint_path = os.getenv("ML_CHECKPOINT_PATH", str(get_ml_checkpoint_path(run_id=run_id)))
    preprocessing_out = os.getenv("ML_PREPROCESSING_OUT", str(get_ml_preprocessing_path(run_id=run_id)))
    use_weighted_sampler = os.getenv("USE_WEIGHTED_SAMPLER", "1") == "1"
    use_class_weights = os.getenv("USE_CLASS_WEIGHTS", "1") == "1"
    class_weight_clip_min = float(os.getenv("CLASS_WEIGHT_CLIP_MIN", "0.5"))
    class_weight_clip_max = float(os.getenv("CLASS_WEIGHT_CLIP_MAX", "25.0"))
    train_epochs = int(os.getenv("TRAIN_EPOCHS", "30"))
    learning_rate = float(os.getenv("LEARNING_RATE", "0.001"))
    patience = int(os.getenv("PATIENCE", "5"))
    batch_size = int(os.getenv("BATCH_SIZE", "256"))
    loss_type = os.getenv("LOSS_TYPE", "ce")
    focal_gamma = float(os.getenv("FOCAL_GAMMA", "2.0"))
    class_balanced_beta = float(os.getenv("CB_BETA", "0.9999"))
    label_smoothing = float(os.getenv("LABEL_SMOOTHING", "0.0"))
    weight_decay = float(os.getenv("WEIGHT_DECAY", "0.0001"))
    use_lr_scheduler = os.getenv("USE_LR_SCHEDULER", "0") == "1"
    scheduler_patience = int(os.getenv("SCHEDULER_PATIENCE", "2"))
    scheduler_factor = float(os.getenv("SCHEDULER_FACTOR", "0.5"))
    dropout_rate = float(os.getenv("DROPOUT_RATE", "0.2"))
    metrics_out = os.getenv("METRICS_OUT", str(get_ml_metrics_path(run_id=run_id)))

    print(
        f"🧪 Run={run_id} | weighted_sampler={use_weighted_sampler} | "
        f"class_weights={use_class_weights} | clip=[{class_weight_clip_min}, {class_weight_clip_max}] | "
        f"epochs={train_epochs} | lr={learning_rate} | batch_size={batch_size} | patience={patience} | "
        f"loss={loss_type} | dropout={dropout_rate} | weight_decay={weight_decay} | "
        f"label_smoothing={label_smoothing} | lr_scheduler={use_lr_scheduler} | "
        f"ckpt={checkpoint_path}"
    )

    corridor_ids = [
        136550177913819656,
        392537437542429252,
        646713380690000556,
        647577676530405923,
        988709510142577156,
        1100735735503891924,
    ]
    start_date = "2026-03-20"
    end_date = "2026-04-08"

    all_segments_data = []

    print(f"🌍 BẮT ĐẦU KÉO DỮ LIỆU TỪ {len(corridor_ids)} CORRIDORS...")
    for corridor_id in corridor_ids:
        print(f"\n👉 Đang truy xuất Corridor ID: {corridor_id}")
        corridor_data = load_bulk_corridor_data(
            corridor_id=corridor_id,
            start_date=start_date,
            end_date=end_date,
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

    print(f"\n✅ ĐÃ TẢI THÀNH CÔNG SIÊU TẬP DỮ LIỆU: {df_master.shape[0]} dòng.")
    print("⏳ Đang tính toán DataLoaders (Quá trình mã hóa và scale có thể mất vài phút)...")

    train_loader, val_loader, scaler, encoders = prepare_dataloaders(
        df_master,
        train_ratio=0.8,
        batch_size=batch_size,
        window_size=12,
        use_weighted_sampler=use_weighted_sampler,
    )

    print("\n💾 Đang xuất các bộ biến đổi (Scaler & Encoders)...")
    artifacts = {
        "scaler": scaler,
        "encoders": encoders,
    }
    joblib.dump(artifacts, preprocessing_out)
    print(f"✅ Đã xuất preprocessing artifacts: {preprocessing_out}")

    vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}
    model = TrafficCongestionModel(vocab_sizes=vocab_sizes, dropout_rate=dropout_rate)

    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")

    history, summary = train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        train_dataset=train_loader.dataset,
        epochs=train_epochs,
        learning_rate=learning_rate,
        device=device,
        patience=patience,
        use_class_weights=use_class_weights,
        class_weight_clip_min=class_weight_clip_min,
        class_weight_clip_max=class_weight_clip_max,
        loss_type=loss_type,
        focal_gamma=focal_gamma,
        class_balanced_beta=class_balanced_beta,
        label_smoothing=label_smoothing,
        weight_decay=weight_decay,
        use_lr_scheduler=use_lr_scheduler,
        scheduler_patience=scheduler_patience,
        scheduler_factor=scheduler_factor,
        checkpoint_path=checkpoint_path,
    )

    if metrics_out:
        # Build comprehensive metrics breakdown
        class_names = {0: "VeryFree", 1: "Stable", 2: "Moderate", 3: "Congested", 4: "HeavyJam", 5: "Severe"}
        
        # Per-class history at best epoch
        best_epoch_idx = summary["best_epoch"] - 1
        per_class_at_best = {}
        for cls_idx in range(6):
            per_class_at_best[f"class_{cls_idx}"] = {
                "name": class_names[cls_idx],
                "recall": history["per_class_recall"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_recall"][cls_idx]) else 0.0,
                "precision": history["per_class_precision"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_precision"][cls_idx]) else 0.0,
                "f1": history["per_class_f1"][cls_idx][best_epoch_idx] if best_epoch_idx < len(history["per_class_f1"][cls_idx]) else 0.0,
            }
        
        # Per-class trajectory (all epochs)
        per_class_trajectory = {}
        for cls_idx in range(6):
            per_class_trajectory[f"class_{cls_idx}"] = {
                "name": class_names[cls_idx],
                "recall_history": history["per_class_recall"][cls_idx],
                "precision_history": history["per_class_precision"][cls_idx],
                "f1_history": history["per_class_f1"][cls_idx],
            }
        
        out_payload = {
            "run_id": run_id,
            "config": {
                "use_weighted_sampler": use_weighted_sampler,
                "use_class_weights": use_class_weights,
                "class_weight_clip_min": class_weight_clip_min,
                "class_weight_clip_max": class_weight_clip_max,
                "loss_type": loss_type,
                "focal_gamma": focal_gamma,
                "class_balanced_beta": class_balanced_beta,
                "label_smoothing": label_smoothing,
                "weight_decay": weight_decay,
                "use_lr_scheduler": use_lr_scheduler,
                "scheduler_patience": scheduler_patience,
                "scheduler_factor": scheduler_factor,
                "dropout_rate": dropout_rate,
                "epochs": train_epochs,
                "learning_rate": learning_rate,
                "batch_size": batch_size,
                "patience": patience,
            },
            "summary": summary,
            "per_class_at_best_epoch": per_class_at_best,
            "per_class_trajectory": per_class_trajectory,
            "confusion_matrix": {
                "labels": [0, 1, 2, 3, 4, 5],
                "matrix": summary.get("confusion_matrix", []),
            },
        }
        with open(metrics_out, "w", encoding="utf-8") as file_handle:
            json.dump(out_payload, file_handle, indent=2)
        print(f"📝 Đã ghi metrics ra {metrics_out}")
        
        # Print structured summary to console
        print("\n" + "="*80)
        print("📊 PER-CLASS METRICS TẠI BEST EPOCH")
        print("="*80)
        for cls_idx in range(6):
            metrics = per_class_at_best[f"class_{cls_idx}"]
            marker = "⚠️ " if cls_idx >= 4 else "  "
            print(f"{marker}Class {cls_idx} ({metrics['name']:12s}): Recall={metrics['recall']:.4f} | Prec={metrics['precision']:.4f} | F1={metrics['f1']:.4f}")
        print("="*80)


if __name__ == "__main__":
    main()