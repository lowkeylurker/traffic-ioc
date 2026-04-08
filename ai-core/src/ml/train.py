import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import time
import os
import json
from sklearn.metrics import accuracy_score, f1_score, recall_score
from sklearn.utils.class_weight import compute_class_weight
import pandas as pd
import joblib

# Đảm bảo import đúng đường dẫn theo cấu trúc project của bạn
from src.utils.data_loader import load_bulk_corridor_data
from src.ml.dataset import prepare_dataloaders
from src.ml.traffic_model import TrafficCongestionModel


def focal_loss(logits, targets, alpha=None, gamma: float = 2.0):
    ce = nn.functional.cross_entropy(logits, targets, weight=alpha, reduction='none')
    pt = torch.exp(-ce)
    loss = ((1 - pt) ** gamma) * ce
    return loss.mean()


def class_balanced_weights(train_dataset, num_classes: int = 6, beta: float = 0.9999) -> torch.Tensor:
    targets = train_dataset.get_training_targets()
    counts = np.bincount(targets, minlength=num_classes).astype(np.float64)
    weights = np.zeros(num_classes, dtype=np.float64)
    for c in range(num_classes):
        n = counts[c]
        if n > 0:
            weights[c] = (1.0 - beta) / (1.0 - (beta ** n))
    if weights.sum() > 0:
        weights = weights / weights.sum() * num_classes
    return torch.tensor(weights.astype(np.float32), dtype=torch.float32)

def get_class_weights(train_dataset, num_classes=6, clip_min: float = 0.5, clip_max: float = 25.0):
    """
    Tính toán Class Weights an toàn, tự động xử lý trường hợp thiếu nhãn trong tập test.
    """
    print("⏳ Đang phân tích phân phối nhãn để tính toán Class Weights...")
    y_train = train_dataset.get_training_targets()
    
    # Lấy danh sách các nhãn thực tế đang có trong dữ liệu (ví dụ: [0, 1, 2, 3])
    present_classes = np.unique(y_train)
    
    # Tính trọng số cho những lớp đang hiện diện
    weights_present = compute_class_weight(
        class_weight='balanced', 
        classes=present_classes, 
        y=y_train
    )
    
    # Tạo một mảng trọng số mặc định là 1.0 cho tất cả 6 lớp
    # Cắt ngưỡng để các lớp hiếm không chi phối loss quá mạnh.
    final_weights = np.ones(num_classes, dtype=np.float32)
    
    # Cập nhật trọng số đã tính vào các vị trí tương ứng
    for idx, cls in enumerate(present_classes):
        if cls < num_classes:
            final_weights[cls] = weights_present[idx]

    final_weights = np.clip(final_weights, clip_min, clip_max)
    
    print(f"📊 Phân bổ Trọng số Phạt (6 lớp): {np.round(final_weights, 3)}")
    return torch.tensor(final_weights, dtype=torch.float32)

def train_model(
    model,
    train_loader,
    val_loader,
    train_dataset,
    epochs=50,
    learning_rate=1e-3,
    device='cpu',
    patience=4,
    use_class_weights: bool = True,
    class_weight_clip_min: float = 0.5,
    class_weight_clip_max: float = 25.0,
    loss_type: str = 'ce',
    focal_gamma: float = 2.0,
    class_balanced_beta: float = 0.9999,
    label_smoothing: float = 0.0,
    weight_decay: float = 1e-4,
    use_lr_scheduler: bool = False,
    scheduler_patience: int = 2,
    scheduler_factor: float = 0.5,
):
    """
    Vòng lặp Huấn luyện (Training Loop) thuần PyTorch.
    """
    print(f"\n🚀 BẮT ĐẦU HUẤN LUYỆN TRÊN THIẾT BỊ: {str(device).upper()}")
    model.to(device)
    
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
    if loss_type == 'cb_focal':
        cb_weights = class_balanced_weights(train_dataset, beta=class_balanced_beta).to(device)
        print(f"📊 Class-Balanced Weights: {cb_weights.detach().cpu().numpy()}")

    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=label_smoothing)
    
    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
    scheduler = None
    if use_lr_scheduler:
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            mode='max',
            factor=scheduler_factor,
            patience=scheduler_patience,
        )

    history = {'train_loss': [], 'val_loss': [], 'val_acc': [], 'val_f1': [], 'epoch_time_sec': []}
    best_f1 = 0.0
    best_epoch = 0
    best_val_loss = float('inf')
    best_val_acc = 0.0
    best_train_loss = float('inf')
    best_minority_recall = 0.0
    epochs_without_improve = 0
    
    for epoch in range(epochs):
        start_time = time.time()
        
        # ==========================================
        # PHA 1: HUẤN LUYỆN
        # ==========================================
        model.train() 
        train_loss = 0.0
        
        for batch in train_loader:
            x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]
            
            optimizer.zero_grad()
            logits = model(x_dynamic, x_static, x_cat)
            if loss_type == 'focal':
                loss = focal_loss(logits, y_target, alpha=class_weights, gamma=focal_gamma)
            elif loss_type == 'cb_focal':
                loss = focal_loss(logits, y_target, alpha=cb_weights, gamma=focal_gamma)
            else:
                loss = criterion(logits, y_target)
            
            if torch.isnan(loss):
                print("❌ Loss bị NaN! Đang dừng để kiểm tra...")
                return history

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            train_loss += loss.item() * x_dynamic.size(0)
            
        train_loss = train_loss / len(train_loader.dataset)
        
        # ==========================================
        # PHA 2: ĐÁNH GIÁ
        # ==========================================
        model.eval() 
        val_loss = 0.0
        all_preds = []
        all_targets = []
        
        with torch.no_grad():
            for batch in val_loader:
                x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]
                
                logits = model(x_dynamic, x_static, x_cat)
                if loss_type == 'focal':
                    loss = focal_loss(logits, y_target, alpha=class_weights, gamma=focal_gamma)
                elif loss_type == 'cb_focal':
                    loss = focal_loss(logits, y_target, alpha=cb_weights, gamma=focal_gamma)
                else:
                    loss = criterion(logits, y_target)
                val_loss += loss.item() * x_dynamic.size(0)
                
                preds = torch.argmax(logits, dim=1)
                all_preds.extend(preds.cpu().numpy())
                all_targets.extend(y_target.cpu().numpy())
                
        val_loss = val_loss / len(val_loader.dataset)
        val_acc = accuracy_score(all_targets, all_preds)
        val_f1 = f1_score(all_targets, all_preds, average='macro')
        per_class_recall = recall_score(all_targets, all_preds, labels=[0, 1, 2, 3, 4, 5], average=None, zero_division=0)
        minority_recall = float((per_class_recall[4] + per_class_recall[5]) / 2.0)
        
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        history['val_f1'].append(val_f1)
        
        epoch_time = time.time() - start_time
        history['epoch_time_sec'].append(epoch_time)
        
        print(f"Epoch {epoch+1:03d}/{epochs} | Time: {epoch_time:.1f}s | "
              f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | "
              f"Val Acc: {val_acc:.4f} | Val Macro-F1: {val_f1:.4f}")
              
        if val_f1 > best_f1:
            best_f1 = val_f1
            best_epoch = epoch + 1
            best_val_loss = val_loss
            best_val_acc = val_acc
            best_train_loss = train_loss
            best_minority_recall = minority_recall
            epochs_without_improve = 0
            print(f"🌟 Kỷ lục mới! Macro-F1 tăng lên {best_f1:.4f}. Đang lưu mô hình...")
            torch.save(model.state_dict(), 'best_traffic_model.pt')
        else:
            epochs_without_improve += 1

        if scheduler is not None:
            scheduler.step(val_f1)

        if epochs_without_improve >= patience:
            print(
                f"⏹️ Early stopping: không cải thiện Macro-F1 sau {patience} epoch liên tiếp. "
                f"Best epoch = {best_epoch}, best Macro-F1 = {best_f1:.4f}"
            )
            break

    print(f"\n✅ HUẤN LUYỆN HOÀN TẤT. Macro-F1 tốt nhất đạt: {best_f1:.4f}")
    summary = {
        'best_epoch': int(best_epoch),
        'best_val_f1': float(best_f1),
        'best_val_acc': float(best_val_acc),
        'best_val_loss': float(best_val_loss),
        'best_train_loss': float(best_train_loss),
        'train_val_gap': float(best_val_loss - best_train_loss),
        'minority_recall_45': float(best_minority_recall),
        'avg_time_per_epoch_sec': float(np.mean(history.get('epoch_time_sec', []))) if history.get('epoch_time_sec') else 0.0,
    }
    return history, summary

# =====================================================================
# KHỐI THỰC THI CHÍNH (MASTER PLAN)
# =====================================================================
if __name__ == "__main__":
    print("--- KHỞI ĐỘNG HUẤN LUYỆN TOÀN TẬP TRÊN 6 CORRIDORS ---")

    run_id = os.getenv("RUN_ID", "manual")
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
    metrics_out = os.getenv("METRICS_OUT", "")

    print(
        f"🧪 Run={run_id} | weighted_sampler={use_weighted_sampler} | "
        f"class_weights={use_class_weights} | clip=[{class_weight_clip_min}, {class_weight_clip_max}] | "
        f"epochs={train_epochs} | lr={learning_rate} | batch_size={batch_size} | patience={patience} | "
        f"loss={loss_type} | dropout={dropout_rate} | weight_decay={weight_decay} | "
        f"label_smoothing={label_smoothing} | lr_scheduler={use_lr_scheduler}"
    )
    
    # 1. CẤU HÌNH DỮ LIỆU
    CORRIDOR_IDS = [
        136550177913819656, 
        392537437542429252, 
        646713380690000556, 
        647577676530405923, 
        988709510142577156, 
        1100735735503891924  
    ]
    
    # Khung thời gian huấn luyện tổng quát
    START_DATE = '2026-03-20' # Điều chỉnh cho khớp DB của bạn
    END_DATE = '2026-04-08'   # Điều chỉnh cho khớp DB của bạn
    
    all_segments_data = []
    
    print(f"🌍 BẮT ĐẦU KÉO DỮ LIỆU TỪ {len(CORRIDOR_IDS)} CORRIDORS...")
    for cid in CORRIDOR_IDS:
        print(f"\n👉 Đang truy xuất Corridor ID: {cid}")
        c_data = load_bulk_corridor_data(
            corridor_id=cid, 
            start_date=START_DATE, 
            end_date=END_DATE,
            peak_hours_only=True
        )
        
        if c_data:
            df_corridor = pd.concat(c_data.values(), ignore_index=True)
            all_segments_data.append(df_corridor)
            
    if not all_segments_data:
        print("❌ Không lấy được dữ liệu nào. Hãy kiểm tra lại Database hoặc Thời gian.")
        exit()
        
    # 2. GỘP VÀ CHUẨN BỊ SIÊU TẬP DỮ LIỆU
    df_master = pd.concat(all_segments_data, ignore_index=True)
    
    # BẮT BUỘC: Sort lại toàn bộ theo segment và thời gian để cửa sổ trượt hoạt động đúng
    df_master = df_master.sort_values(by=['segment_key', 'timestamp']).reset_index(drop=True)
    
    print(f"\n✅ ĐÃ TẢI THÀNH CÔNG SIÊU TẬP DỮ LIỆU: {df_master.shape[0]} dòng.")
    print("⏳ Đang tính toán DataLoaders (Quá trình mã hóa và scale có thể mất vài phút)...")
    
    # Với 1.4M dòng, nên dùng batch_size lớn (128, 256, hoặc 512) để tận dụng GPU
    train_loader, val_loader, scaler, encoders = prepare_dataloaders(
        df_master,
        train_ratio=0.8,
        batch_size=batch_size,
        window_size=12,
        use_weighted_sampler=use_weighted_sampler,
    )
    
    # 3. LƯU ARTIFACTS DÀNH CHO MODULE INFERENCE
    print("\n💾 Đang xuất các bộ biến đổi (Scaler & Encoders)...")
    artifacts = {
        'scaler': scaler,
        'encoders': encoders
    }
    joblib.dump(artifacts, 'preprocessing_artifacts.pkl')
    print("✅ Đã xuất file 'preprocessing_artifacts.pkl' thành công!")
    
    # 4. KHỞI TẠO VÀ HUẤN LUYỆN MÔ HÌNH
    vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}
    model = TrafficCongestionModel(vocab_sizes=vocab_sizes, dropout_rate=dropout_rate)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
    
    # Bắt đầu vòng lặp huấn luyện thực tế
    # Mình để mặc định epochs=30, bạn có thể tăng lên 50 nếu mô hình vẫn chưa có dấu hiệu Overfitting
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
    )

    if metrics_out:
        out_payload = {
            'run_id': run_id,
            'config': {
                'use_weighted_sampler': use_weighted_sampler,
                'use_class_weights': use_class_weights,
                'class_weight_clip_min': class_weight_clip_min,
                'class_weight_clip_max': class_weight_clip_max,
                'loss_type': loss_type,
                'focal_gamma': focal_gamma,
                'class_balanced_beta': class_balanced_beta,
                'label_smoothing': label_smoothing,
                'weight_decay': weight_decay,
                'use_lr_scheduler': use_lr_scheduler,
                'scheduler_patience': scheduler_patience,
                'scheduler_factor': scheduler_factor,
                'dropout_rate': dropout_rate,
                'epochs': train_epochs,
                'learning_rate': learning_rate,
                'batch_size': batch_size,
                'patience': patience,
            },
            'summary': summary,
        }
        with open(metrics_out, 'w', encoding='utf-8') as f:
            json.dump(out_payload, f, indent=2)
        print(f"📝 Đã ghi metrics ra {metrics_out}")