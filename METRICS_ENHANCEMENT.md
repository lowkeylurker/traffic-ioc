# Cập Nhật Metrics: Class-Level Visibility Đầy Đủ

## 🎯 Tóm Tắt Thay Đổi

Triển khai **per-class metrics tracking** và **confusion matrix** toàn diện để monitor performance trên từng lớp, đặc biệt là classes 3-5 (minority classes).

## 📝 Chi Tiết Triển Khai

### 1. **Thêm Per-Class Metrics Tracking** (`src/ml/training/loop.py`)

#### Imports mới:
```python
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,  # NEW
    recall_score,
)
```

#### History dict được mở rộng:
```python
history = {
    "train_loss": [],
    "val_loss": [],
    "val_acc": [],
    "val_f1": [],
    "epoch_time_sec": [],
    "per_class_recall": [[] for _ in range(6)],        # NEW
    "per_class_precision": [[] for _ in range(6)],    # NEW
    "per_class_f1": [[] for _ in range(6)],           # NEW
}
```

#### Metrics calculation mỗi epoch:
```python
# Per-class metrics từ predictions
per_class_precision, per_class_recall, per_class_f1, _ = precision_recall_fscore_support(
    all_targets, all_preds, 
    labels=[0, 1, 2, 3, 4, 5], 
    average=None, 
    zero_division=0
)

# Track vào history cho mỗi class
for cls_idx in range(6):
    history["per_class_recall"][cls_idx].append(float(per_class_recall[cls_idx]))
    history["per_class_precision"][cls_idx].append(float(per_class_precision[cls_idx]))
    history["per_class_f1"][cls_idx].append(float(per_class_f1[cls_idx]))
```

### 2. **Enhanced Console Output** 

#### Trước (Compact):
```
Epoch 001/30 | Time: 12.3s | Train Loss: 0.8234 | Val Loss: 0.9102 | Val Acc: 0.7243 | Val Macro-F1: 0.5621
```

#### Sau (Detailed per-class):
```
================================================================================
Epoch 001/30 | Time: 12.3s | Train Loss: 0.8234 | Val Loss: 0.9102
Val Acc: 0.7243 | Val Macro-F1: 0.5621
--------------------------------------------------------------------------------
  Class 0 (VeryFree    ) | Recall: 0.8943 | Prec: 0.9102 | F1: 0.9021
  Class 1 (Stable      ) | Recall: 0.7623 | Prec: 0.8234 | F1: 0.7921
  Class 2 (Moderate    ) | Recall: 0.4521 | Prec: 0.5634 | F1: 0.5012
  Class 3 (Congested   ) | Recall: 0.2341 | Prec: 0.3128 | F1: 0.2699
⚠️ Class 4 (HeavyJam    ) | Recall: 0.0123 | Prec: 0.0456 | F1: 0.0198
⚠️ Class 5 (Severe      ) | Recall: 0.0045 | Prec: 0.0089 | F1: 0.0062
================================================================================
```

### 3. **Confusion Matrix Tracking**

#### Best epoch predictions được lưu:
```python
if val_f1 > best_f1:
    # ... other updates ...
    best_epoch_predictions = np.array(all_preds)      # NEW
    best_epoch_targets = np.array(all_targets)        # NEW
```

#### Confusion matrix tính từ best epoch:
```python
cm = confusion_matrix(
    best_epoch_targets, 
    best_epoch_predictions, 
    labels=[0, 1, 2, 3, 4, 5]
)

summary["confusion_matrix"] = cm.tolist()  # 6x6 matrix
```

### 4. **JSON Export Expansion** (`scripts/run_ml_train.py`)

#### Trước - JSON chỉ chứa:
```json
{
  "summary": {
    "best_epoch": 12,
    "best_val_f1": 0.5621,
    "minority_recall_45": 0.0084
  }
}
```

#### Sau - Full breakdown:
```json
{
  "summary": {
    "best_epoch": 12,
    "best_val_f1": 0.5621,
    "minority_recall_45": 0.0084,
    "per_class_metrics": {
      "class_0": {"recall": 0.8943, "precision": 0.9102, "f1": 0.9021},
      "class_1": {"recall": 0.7623, "precision": 0.8234, "f1": 0.7921},
      "class_2": {"recall": 0.4521, "precision": 0.5634, "f1": 0.5012},
      "class_3": {"recall": 0.2341, "precision": 0.3128, "f1": 0.2699},
      "class_4": {"recall": 0.0123, "precision": 0.0456, "f1": 0.0198},
      "class_5": {"recall": 0.0045, "precision": 0.0089, "f1": 0.0062}
    },
    "confusion_matrix": [
      [14523, 1234, 45, ...],
      [1203, 12245, 321, ...],
      ...
    ]
  },
  "per_class_at_best_epoch": {
    "class_0": {"name": "VeryFree", "recall": 0.8943, ...},
    "class_1": {"name": "Stable", "recall": 0.7623, ...},
    ...
  },
  "per_class_trajectory": {
    "class_0": {
      "name": "VeryFree",
      "recall_history": [0.8102, 0.8234, ..., 0.8943],
      "precision_history": [0.8901, 0.9012, ..., 0.9102],
      "f1_history": [0.8501, 0.8621, ..., 0.9021]
    },
    ...
  }
}
```

### 5. **Console Summary Output**

Training kết thúc, in final summary:
```
================================================================================
📊 PER-CLASS METRICS TẠI BEST EPOCH
================================================================================
  Class 0 (VeryFree   ): Recall=0.8943 | Prec=0.9102 | F1=0.9021
  Class 1 (Stable     ): Recall=0.7623 | Prec=0.8234 | F1=0.7921
  Class 2 (Moderate   ): Recall=0.4521 | Prec=0.5634 | F1=0.5012
  Class 3 (Congested  ): Recall=0.2341 | Prec=0.3128 | F1=0.2699
⚠️ Class 4 (HeavyJam  ): Recall=0.0123 | Prec=0.0456 | F1=0.0198
⚠️ Class 5 (Severe    ): Recall=0.0045 | Prec=0.0089 | F1=0.0062
================================================================================
📝 Đã ghi metrics ra metrics_pilot.json
```

## 📊 Dữ Liệu Export Có Sẵn

### `history` dict (in-memory):
- **Per-class trajectory**: Toàn bộ 30 epochs, từng class
- **Dùng cho**: Vẽ learning curves per-class, phân tích convergence riêng lẻ

### `metrics_pilot.json`:
- **Per-class at best epoch**: Class-level precision, recall, F1 tại epoch tốt nhất
- **Per-class trajectory**: Toàn bộ lịch sử mỗi class (30 epochs)
- **Confusion matrix**: 6x6 ma trận từ best epoch predictions
- **Dùng cho**: Report, visualization, so sánh between runs

## 🎯 Các Trường Hợp Sử Dụng

### Use Case 1: Kiểm Tra Minority Class Performance (Classes 4-5)
```python
# Từ JSON
minority_recall_4 = results['per_class_at_best_epoch']['class_4']['recall']
minority_f1_5 = results['per_class_at_best_epoch']['class_5']['f1']

if minority_recall_4 < 0.1 or minority_f1_5 < 0.05:
    print("⚠️ CRITICAL: Minority class đủ yếu!")
```

### Use Case 2: Confusion Between Similar Classes
```python
cm = np.array(results['summary']['confusion_matrix'])
# Class 1 vs Class 0 confusion: cm[1, 0] vs cm[1, 1]
print(f"Class 1 confused as Class 0: {cm[1, 0]} times")
```

### Use Case 3: Vẽ Learning Curves Per-Class
```python
import matplotlib.pyplot as plt

for cls_idx in range(6):
    trajectory = results['per_class_trajectory'][f'class_{cls_idx}']
    plt.plot(trajectory['f1_history'], label=f"Class {cls_idx}")

plt.legend()
plt.show()
```

## 🔄 So Sánh: Before vs After

| Metric | Before | After |
|--------|--------|-------|
| **Recall per-class** | ❌ Không tracking | ✅ Tracked mỗi epoch |
| **Precision per-class** | ❌ Không tính | ✅ Tracked mỗi epoch |
| **F1 per-class** | ❌ Chỉ macro-F1 | ✅ Tracked mỗi epoch |
| **Console clarity** | ⚠️ Cơ basic | ✅ Chi tiết 6 classes |
| **JSON export** | ⚠️ Thiếu per-class | ✅ Full breakdown |
| **Confusion matrix** | ❌ Không có | ✅ 6x6 matrix |
| **Minority class vis** | ❌ Chỉ text | ✅ ⚠️ Marker + metrics |

## 💡 Hướng Tiếp Theo (Bước 6: Pilot Training)

### Command để run pilot:
```bash
export METRICS_OUT="metrics_pilot.json"
export TRAIN_EPOCHS="30"
export USE_CLASS_WEIGHTS="1"
export LOSS_TYPE="ce"

python scripts/run_ml_train.py
```

### Sau khi hoàn tất:
1. Kiểm tra `metrics_pilot.json` để xem class 4-5 performance
2. Nếu recall < 0.05 cho minority classes → cần più epoch hoặc focal loss
3. Nếu recall > 0.1 → ổn định, ready chuyển full training
4. Script sẽ in summary ngay console → copy vào report

## 📌 Files Modified

1. `src/ml/training/loop.py`:
   - ✅ Thêm imports (precision_recall_fscore_support, confusion_matrix)
   - ✅ Expand history dict
   - ✅ Tính per-class metrics mỗi epoch
   - ✅ Enhanced console output
   - ✅ Save best epoch predictions
   - ✅ Tính confusion matrix final

2. `scripts/run_ml_train.py`:
   - ✅ Build per_class_at_best_epoch section
   - ✅ Build per_class_trajectory section
   - ✅ Export confusion_matrix vào JSON
   - ✅ Print final summary to console

**Status**: ✅ Đã triển khai và compile pass
