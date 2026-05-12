"""Training loop orchestration for supervised ML."""

from __future__ import annotations

import os
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    recall_score,
)
from sklearn.preprocessing import label_binarize
from torch.utils.tensorboard import SummaryWriter

from src.ml.feature_contract import CLASS_MAPPING, NUM_CLASSES
from src.ml.training.class_weighting import class_balanced_weights, get_class_weights
from src.ml.training.losses import focal_loss


def train_model(
    model,
    train_loader,
    val_loader,
    train_dataset,
    epochs=50,
    learning_rate=1e-3,
    device="cpu",
    patience=4,
    use_class_weights: bool = True,
    class_weight_clip_min: float = 0.5,
    class_weight_clip_max: float = 25.0,
    loss_type: str = "ce",
    focal_gamma: float = 2.0,
    class_balanced_beta: float = 0.9999,
    label_smoothing: float = 0.0,
    weight_decay: float = 1e-4,
    use_lr_scheduler: bool = False,
    scheduler_patience: int = 2,
    scheduler_factor: float = 0.5,
    checkpoint_path: str = "best_traffic_model.pt",
    tensorboard_log_dir: str | None = None,
):
    print(f"\n🚀 BẮT ĐẦU HUẤN LUYỆN TRÊN THIẾT BỊ: {str(device).upper()}")
    model.to(device)

    if tensorboard_log_dir is None:
        tensorboard_log_dir = os.getenv("ML_TENSORBOARD_LOG_DIR")
    if tensorboard_log_dir is None:
        tensorboard_log_dir = str(Path(checkpoint_path).resolve().parent / "runs" / Path(checkpoint_path).stem)
    writer = SummaryWriter(log_dir=tensorboard_log_dir)

    class_weights = None
    if use_class_weights:
        class_weights = get_class_weights(
            train_dataset,
            clip_min=class_weight_clip_min,
            clip_max=class_weight_clip_max,
        ).to(device)
    else:
        print("📊 Class Weights: OFF")

    cb_weights = None
    if loss_type == "cb_focal":
        cb_weights = class_balanced_weights(train_dataset, beta=class_balanced_beta).to(device)
        print(f"📊 Class-Balanced Weights: {cb_weights.detach().cpu().numpy()}")

    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=label_smoothing)

    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    scheduler = None
    if use_lr_scheduler:
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            mode="max",
            factor=scheduler_factor,
            patience=scheduler_patience,
        )

    history = {
        "train_loss": [],
        "val_loss": [],
        "val_acc": [],
        "val_f1": [],
        "val_pr_auc_macro": [],
        "epoch_time_sec": [],
        "learning_rate": [],
        "learning_rate_after_scheduler": [],
        "gradient_norm_mean": [],
        "gradient_norm_max": [],
        "per_class_recall": [[] for _ in range(NUM_CLASSES)],
        "per_class_precision": [[] for _ in range(NUM_CLASSES)],
        "per_class_f1": [[] for _ in range(NUM_CLASSES)],
        "per_class_pr_auc": [[] for _ in range(NUM_CLASSES)],
    }
    best_f1 = 0.0
    best_epoch = 0
    best_val_loss = float("inf")
    best_val_acc = 0.0
    best_train_loss = float("inf")
    best_minority_recall = 0.0
    best_epoch_predictions = None
    best_epoch_targets = None
    epochs_without_improve = 0

    for epoch in range(epochs):
        start_time = time.time()
        epoch_lr = float(optimizer.param_groups[0]["lr"])

        model.train()
        train_loss = 0.0
        grad_norms: list[float] = []

        for batch in train_loader:
            x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]

            optimizer.zero_grad()
            logits = model(x_dynamic, x_static, x_cat)
            if loss_type == "focal":
                loss = focal_loss(logits, y_target, alpha=class_weights, gamma=focal_gamma)
            elif loss_type == "cb_focal":
                loss = focal_loss(logits, y_target, alpha=cb_weights, gamma=focal_gamma)
            else:
                loss = criterion(logits, y_target)

            if torch.isnan(loss):
                print("❌ Loss bị NaN! Đang dừng để kiểm tra...")
                writer.close()
                return history

            loss.backward()
            grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            grad_norms.append(float(grad_norm))
            optimizer.step()

            train_loss += loss.item() * x_dynamic.size(0)

        train_loss = train_loss / len(train_loader.dataset)

        model.eval()
        val_loss = 0.0
        all_preds = []
        all_targets = []
        all_probabilities = []

        with torch.no_grad():
            for batch in val_loader:
                x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]

                logits = model(x_dynamic, x_static, x_cat)
                if loss_type == "focal":
                    loss = focal_loss(logits, y_target, alpha=class_weights, gamma=focal_gamma)
                elif loss_type == "cb_focal":
                    loss = focal_loss(logits, y_target, alpha=cb_weights, gamma=focal_gamma)
                else:
                    loss = criterion(logits, y_target)
                val_loss += loss.item() * x_dynamic.size(0)

                probabilities = torch.softmax(logits, dim=1)
                preds = torch.argmax(logits, dim=1)
                all_preds.extend(preds.cpu().numpy())
                all_targets.extend(y_target.cpu().numpy())
                all_probabilities.extend(probabilities.cpu().numpy())

        val_loss = val_loss / len(val_loader.dataset)
        val_acc = accuracy_score(all_targets, all_preds)
        val_f1 = f1_score(all_targets, all_preds, average="macro")

        y_true_bin = label_binarize(all_targets, classes=list(range(NUM_CLASSES)))
        all_probabilities_np = np.asarray(all_probabilities, dtype=np.float32)
        per_class_pr_auc = np.zeros(NUM_CLASSES, dtype=np.float32)
        for cls_idx in range(NUM_CLASSES):
            if y_true_bin[:, cls_idx].sum() > 0:
                score = average_precision_score(y_true_bin[:, cls_idx], all_probabilities_np[:, cls_idx])
                per_class_pr_auc[cls_idx] = float(score) if np.isfinite(score) else 0.0
            else:
                per_class_pr_auc[cls_idx] = 0.0
        val_pr_auc_macro = float(np.mean(per_class_pr_auc))
        
        # Calculate per-class metrics
        per_class_precision, per_class_recall, per_class_f1, _ = precision_recall_fscore_support(
            all_targets,
            all_preds,
            labels=list(range(NUM_CLASSES)),
            average=None,
            zero_division=0,
        )
        minority_recall = float(per_class_recall[NUM_CLASSES - 1])
        grad_norm_mean = float(np.mean(grad_norms)) if grad_norms else 0.0
        grad_norm_max = float(np.max(grad_norms)) if grad_norms else 0.0

        # Track in history
        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["val_acc"].append(val_acc)
        history["val_f1"].append(val_f1)
        history["val_pr_auc_macro"].append(val_pr_auc_macro)
        history["learning_rate"].append(epoch_lr)
        history["gradient_norm_mean"].append(grad_norm_mean)
        history["gradient_norm_max"].append(grad_norm_max)
        history["learning_rate_after_scheduler"].append(epoch_lr)
        
        for cls_idx in range(NUM_CLASSES):
            history["per_class_recall"][cls_idx].append(float(per_class_recall[cls_idx]))
            history["per_class_precision"][cls_idx].append(float(per_class_precision[cls_idx]))
            history["per_class_f1"][cls_idx].append(float(per_class_f1[cls_idx]))
            history["per_class_pr_auc"][cls_idx].append(float(per_class_pr_auc[cls_idx]))

        epoch_time = time.time() - start_time
        history["epoch_time_sec"].append(epoch_time)

        # Enhanced console output
        class_labels = [CLASS_MAPPING[idx] for idx in range(NUM_CLASSES)]
        print(
            f"\n{'='*80}\n"
            f"Epoch {epoch + 1:03d}/{epochs} | Time: {epoch_time:.1f}s | "
            f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f}\n"
            f"Val Acc: {val_acc:.4f} | Val Macro-F1: {val_f1:.4f} | Val PR-AUC: {val_pr_auc_macro:.4f}\n"
            f"LR: {epoch_lr:.6f} | Grad Norm (mean/max): {grad_norm_mean:.4f}/{grad_norm_max:.4f}\n"
            f"{'-'*80}"
        )
        
        for cls_idx in range(NUM_CLASSES):
            recall_val = per_class_recall[cls_idx]
            prec_val = per_class_precision[cls_idx]
            f1_val = per_class_f1[cls_idx]
            
            # Highlight minority classes
            marker = "⚠️ " if cls_idx == NUM_CLASSES - 1 else "  "
            print(
                f"{marker}Class {cls_idx} ({class_labels[cls_idx]:12s}) | "
                f"Recall: {recall_val:.4f} | Prec: {prec_val:.4f} | F1: {f1_val:.4f}"
            )
        print(f"{'='*80}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            best_epoch = epoch + 1
            best_val_loss = val_loss
            best_val_acc = val_acc
            best_train_loss = train_loss
            best_minority_recall = minority_recall
            best_epoch_predictions = np.array(all_preds)
            best_epoch_targets = np.array(all_targets)
            epochs_without_improve = 0
            print(f"🌟 Kỷ lục mới! Macro-F1 tăng lên {best_f1:.4f}. Đang lưu mô hình...")
            torch.save(model.state_dict(), checkpoint_path)
        else:
            epochs_without_improve += 1

        if scheduler is not None:
            scheduler.step(val_f1)

        next_lr = float(optimizer.param_groups[0]["lr"])
        history["learning_rate_after_scheduler"][-1] = next_lr

        writer.add_scalar("ml/train/loss", train_loss, epoch + 1)
        writer.add_scalar("ml/val/loss", val_loss, epoch + 1)
        writer.add_scalar("ml/val/accuracy", val_acc, epoch + 1)
        writer.add_scalar("ml/val/macro_f1", val_f1, epoch + 1)
        writer.add_scalar("ml/val/pr_auc_macro", val_pr_auc_macro, epoch + 1)
        writer.add_scalar("ml/train/learning_rate", epoch_lr, epoch + 1)
        writer.add_scalar("ml/train/learning_rate_after_scheduler", next_lr, epoch + 1)
        writer.add_scalar("ml/train/gradient_norm_mean", grad_norm_mean, epoch + 1)
        writer.add_scalar("ml/train/gradient_norm_max", grad_norm_max, epoch + 1)
        for cls_idx in range(NUM_CLASSES):
            writer.add_scalar(f"ml/val/per_class_recall/class_{cls_idx}", float(per_class_recall[cls_idx]), epoch + 1)
            writer.add_scalar(f"ml/val/per_class_precision/class_{cls_idx}", float(per_class_precision[cls_idx]), epoch + 1)
            writer.add_scalar(f"ml/val/per_class_f1/class_{cls_idx}", float(per_class_f1[cls_idx]), epoch + 1)
            writer.add_scalar(f"ml/val/per_class_pr_auc/class_{cls_idx}", float(per_class_pr_auc[cls_idx]), epoch + 1)

        if epochs_without_improve >= patience:
            print(
                f"⏹️ Early stopping: không cải thiện Macro-F1 sau {patience} epoch liên tiếp. "
                f"Best epoch = {best_epoch}, best Macro-F1 = {best_f1:.4f}"
            )
            break

    print(f"\n✅ HUẤN LUYỆN HOÀN TẤT. Macro-F1 tốt nhất đạt: {best_f1:.4f}")
    
    # Compute confusion matrix from best epoch predictions
    cm = confusion_matrix(best_epoch_targets, best_epoch_predictions, labels=list(range(NUM_CLASSES)))
    
    # Build per-class summary at best epoch
    best_epoch_idx = best_epoch - 1
    per_class_summary = {}
    for cls_idx in range(NUM_CLASSES):
        per_class_summary[f"class_{cls_idx}"] = {
            "recall": float(history["per_class_recall"][cls_idx][best_epoch_idx]) if best_epoch_idx < len(history["per_class_recall"][cls_idx]) else 0.0,
            "precision": float(history["per_class_precision"][cls_idx][best_epoch_idx]) if best_epoch_idx < len(history["per_class_precision"][cls_idx]) else 0.0,
            "f1": float(history["per_class_f1"][cls_idx][best_epoch_idx]) if best_epoch_idx < len(history["per_class_f1"][cls_idx]) else 0.0,
        }
    
    summary = {
        "best_epoch": int(best_epoch),
        "best_val_f1": float(best_f1),
        "best_val_acc": float(best_val_acc),
        "best_val_loss": float(best_val_loss),
        "best_train_loss": float(best_train_loss),
        "train_val_gap": float(best_val_loss - best_train_loss),
        "minority_recall_last_class": float(best_minority_recall),  # Recall of the last (most critical) class
        "best_val_pr_auc_macro": float(history["val_pr_auc_macro"][best_epoch - 1]) if best_epoch > 0 else 0.0,
        "avg_time_per_epoch_sec": float(np.mean(history.get("epoch_time_sec", []))) if history.get("epoch_time_sec") else 0.0,
        "per_class_metrics": per_class_summary,
        "confusion_matrix": cm.tolist(),
    }

    writer.add_hparams(
        {
            "epochs": epochs,
            "learning_rate": learning_rate,
            "patience": patience,
            "loss_type": loss_type,
            "use_class_weights": int(use_class_weights),
            "use_lr_scheduler": int(use_lr_scheduler),
        },
        {
            "hparam/best_val_f1": summary["best_val_f1"],
            "hparam/best_val_pr_auc_macro": summary["best_val_pr_auc_macro"],
            "hparam/best_val_acc": summary["best_val_acc"],
        },
    )
    writer.close()
    return history, summary
