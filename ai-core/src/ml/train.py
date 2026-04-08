import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import time
from sklearn.metrics import accuracy_score, f1_score
from sklearn.utils.class_weight import compute_class_weight
import pandas as pd
import joblib

# Đảm bảo import đúng đường dẫn theo cấu trúc project của bạn
from src.utils.data_loader import load_bulk_corridor_data
from src.ml.dataset import prepare_dataloaders
from src.ml.traffic_model import TrafficCongestionModel

def get_class_weights(train_dataset, num_classes=6):
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
    final_weights = np.ones(num_classes, dtype=np.float32)
    
    # Cập nhật trọng số đã tính vào các vị trí tương ứng
    for idx, cls in enumerate(present_classes):
        if cls < num_classes:
            final_weights[cls] = weights_present[idx]
    
    print(f"📊 Phân bổ Trọng số Phạt (6 lớp): {np.round(final_weights, 3)}")
    return torch.tensor(final_weights, dtype=torch.float32)

def train_model(model, train_loader, val_loader, train_dataset, epochs=50, learning_rate=1e-3, device='cpu'):
    """
    Vòng lặp Huấn luyện (Training Loop) thuần PyTorch.
    """
    print(f"\n🚀 BẮT ĐẦU HUẤN LUYỆN TRÊN THIẾT BỊ: {str(device).upper()}")
    model.to(device)
    
    class_weights = get_class_weights(train_dataset).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    
    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    history = {'train_loss': [], 'val_loss': [], 'val_acc': [], 'val_f1': []}
    best_f1 = 0.0
    
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
                loss = criterion(logits, y_target)
                val_loss += loss.item() * x_dynamic.size(0)
                
                preds = torch.argmax(logits, dim=1)
                all_preds.extend(preds.cpu().numpy())
                all_targets.extend(y_target.cpu().numpy())
                
        val_loss = val_loss / len(val_loader.dataset)
        val_acc = accuracy_score(all_targets, all_preds)
        val_f1 = f1_score(all_targets, all_preds, average='macro')
        
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        history['val_f1'].append(val_f1)
        
        epoch_time = time.time() - start_time
        
        print(f"Epoch {epoch+1:03d}/{epochs} | Time: {epoch_time:.1f}s | "
              f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | "
              f"Val Acc: {val_acc:.4f} | Val Macro-F1: {val_f1:.4f}")
              
        if val_f1 > best_f1:
            best_f1 = val_f1
            print(f"🌟 Kỷ lục mới! Macro-F1 tăng lên {best_f1:.4f}. Đang lưu mô hình...")
            torch.save(model.state_dict(), 'best_traffic_model.pt')

    print(f"\n✅ HUẤN LUYỆN HOÀN TẤT. Macro-F1 tốt nhất đạt: {best_f1:.4f}")
    return history

# =====================================================================
# KHỐI THỰC THI CHÍNH (MASTER PLAN)
# =====================================================================
if __name__ == "__main__":
    print("--- KHỞI ĐỘNG HUẤN LUYỆN TOÀN TẬP TRÊN 6 CORRIDORS ---")
    
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
        df_master, train_ratio=0.8, batch_size=256, window_size=12
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
    model = TrafficCongestionModel(vocab_sizes=vocab_sizes)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
    
    # Bắt đầu vòng lặp huấn luyện thực tế
    # Mình để mặc định epochs=30, bạn có thể tăng lên 50 nếu mô hình vẫn chưa có dấu hiệu Overfitting
    history = train_model(
        model=model, 
        train_loader=train_loader, 
        val_loader=val_loader, 
        train_dataset=train_loader.dataset,
        epochs=30, 
        learning_rate=0.001, 
        device=device
    )