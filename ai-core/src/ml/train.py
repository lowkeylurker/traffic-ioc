import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import time
from sklearn.metrics import accuracy_score, f1_score
from sklearn.utils.class_weight import compute_class_weight

def get_class_weights(train_dataset, num_classes=6):
    """
    Tính toán Class Weights an toàn, tự động xử lý trường hợp thiếu nhãn trong tập test.
    """
    print("⏳ Đang phân tích phân phối nhãn để tính toán Class Weights...")
    y_train = train_dataset.targets[train_dataset.valid_indices]
    
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
    
    # 1. Khởi tạo Hàm Mất Mát (Loss Function) với Trọng số Cân bằng
    class_weights = get_class_weights(train_dataset).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    
    # 2. Khởi tạo Bộ Tối ưu hóa (Optimizer) AdamW chống over-fitting tốt hơn Adam
    optimizer = optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=1e-4)
    
    # Biến lưu trữ lịch sử để vẽ biểu đồ sau này
    history = {'train_loss': [], 'val_loss': [], 'val_acc': [], 'val_f1': []}
    
    # Biến phục vụ Checkpointing (Lưu model tốt nhất)
    best_f1 = 0.0
    
    for epoch in range(epochs):
        start_time = time.time()
        
        # ==========================================
        # PHA 1: HUẤN LUYỆN (TRAINING PHASE)
        # ==========================================
        model.train() # Mở khóa cập nhật trọng số
        train_loss = 0.0
        
        for batch in train_loader:
            # Rã batch và đẩy lên thiết bị (CPU/GPU)
            x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]
            
            # Xóa sạch gradient của bước trước (bắt buộc trong PyTorch)
            optimizer.zero_grad()
            
            # Forward Pass: Đưa dữ liệu qua mô hình
            logits = model(x_dynamic, x_static, x_cat)
            
            # Tính toán sai số (Loss)
            loss = criterion(logits, y_target)
            
            # KIỂM TRA NaN TRONG LOSS
            if torch.isnan(loss):
                print("❌ Loss bị NaN! Đang dừng để kiểm tra...")
                return history

            # Backward Pass: Lan truyền ngược để tính đạo hàm
            loss.backward()
            
            # Gradient Clipping: Ngăn chặn hiện tượng exploding gradients (đặc biệt quan trọng với LSTM)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

            # Tối ưu hóa: Cập nhật trọng số
            optimizer.step()
            
            train_loss += loss.item() * x_dynamic.size(0)
            
        train_loss = train_loss / len(train_loader.dataset)
        
        # ==========================================
        # PHA 2: ĐÁNH GIÁ (VALIDATION PHASE)
        # ==========================================
        model.eval() # Khóa cập nhật trọng số, tắt Dropout
        val_loss = 0.0
        all_preds = []
        all_targets = []
        
        # Tắt đồ thị tính toán (Gradient Graph) để tiết kiệm RAM siêu hiệu quả
        with torch.no_grad():
            for batch in val_loader:
                x_dynamic, x_static, x_cat, y_target = [tensor.to(device) for tensor in batch]
                
                logits = model(x_dynamic, x_static, x_cat)
                loss = criterion(logits, y_target)
                val_loss += loss.item() * x_dynamic.size(0)
                
                # Tìm ra class có xác suất cao nhất (hàm argmax)
                preds = torch.argmax(logits, dim=1)
                
                # Gom dữ liệu để tính Metrics
                all_preds.extend(preds.cpu().numpy())
                all_targets.extend(y_target.cpu().numpy())
                
        val_loss = val_loss / len(val_loader.dataset)
        
        # Tính toán các chỉ số chất lượng
        val_acc = accuracy_score(all_targets, all_preds)
        # Macro F1 cực kỳ quan trọng cho dữ liệu mất cân bằng (chấm công bằng cho mọi lớp)
        val_f1 = f1_score(all_targets, all_preds, average='macro')
        
        history['train_loss'].append(train_loss)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        history['val_f1'].append(val_f1)
        
        epoch_time = time.time() - start_time
        
        # In Log tiến độ
        print(f"Epoch {epoch+1:03d}/{epochs} | Time: {epoch_time:.1f}s | "
              f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | "
              f"Val Acc: {val_acc:.4f} | Val Macro-F1: {val_f1:.4f}")
              
        # ==========================================
        # MODEL CHECKPOINTING: Lưu lại phiên bản tốt nhất
        # ==========================================
        if val_f1 > best_f1:
            best_f1 = val_f1
            print(f"🌟 Kỷ lục mới! Macro-F1 tăng lên {best_f1:.4f}. Đang lưu mô hình...")
            torch.save(model.state_dict(), 'best_traffic_model.pt')

    print(f"\n✅ HUẤN LUYỆN HOÀN TẤT. Macro-F1 tốt nhất đạt: {best_f1:.4f}")
    return history

# --- KHỐI TEST ĐỘC LẬP TẠI CHỖ ---
if __name__ == "__main__":
    import pandas as pd
    from src.utils.data_loader import load_bulk_corridor_data
    from src.ml.dataset import prepare_dataloaders
    from src.ml.traffic_model import TrafficCongestionModel
    
    print("--- CHUẨN BỊ MÔI TRƯỜNG TEST TRAIN LOOP ---")
    # Kéo 1 đoạn data ngắn
    corridor_data = load_bulk_corridor_data(corridor_id=646713380690000556, start_date='2026-03-20', end_date='2026-03-25')
    
    if corridor_data:
        df_test = pd.concat(corridor_data.values(), ignore_index=True)
        df_test = df_test.sort_values(by=['segment_key', 'timestamp']).reset_index(drop=True)
        
        # Chuẩn bị Loaders
        train_loader, val_loader, scaler, encoders = prepare_dataloaders(df_test, train_ratio=0.8, batch_size=64, window_size=12)
        
        # Lấy kích thước Từ điển
        vocab_sizes = {col: len(enc.classes_) for col, enc in encoders.items()}
        
        # Khởi tạo Mô hình
        model = TrafficCongestionModel(vocab_sizes=vocab_sizes)
        
        # Xác định thiết bị (Tự động nhận diện GPU NVIDIA, Mac M1/M2 hoặc fallback về CPU)
        device = torch.device('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
        
        # Bắn lệnh Train (Chạy thử 3 Epochs để xem luồng Loss có giảm không)
        history = train_model(
            model=model, 
            train_loader=train_loader, 
            val_loader=val_loader, 
            train_dataset=train_loader.dataset, # Truyền vào để tính class weights
            epochs=3, 
            learning_rate=0.0001, 
            device=device
        )