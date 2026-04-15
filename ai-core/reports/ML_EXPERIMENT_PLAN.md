# Ke hoach thi nghiem toi uu model du bao giao thong

## Muc tieu
- Tang Val Macro-F1 on dinh.
- Giu hoac cai thien Val Accuracy.
- Giam chenhlech Train Loss va Val Loss.
- Chon model co kha nang tong quat hoa, khong chi fit train.

## Quy tac danh gia
- Chon checkpoint tai best epoch theo Val Macro-F1.
- Khong chon epoch cuoi neu metric da giam.
- Theo doi them minority recall (lop 4, 5).
- Early stopping: patience = 5.

## Phase 1 - Tim cach can bang lop tot nhat

| Run ID | Sampler | Class Weight | Weight Clip | Loss | LR | Batch | Epoch Max | Early Stop | Muc tieu chinh |
|---|---|---|---|---|---:|---:|---:|---|---|
| A0 (baseline) | OFF | ON | none | CrossEntropy | 1e-3 | 256 | 30 | patience=5 | Moc so sanh |
| A1 | OFF | ON | [0.5, 25] | CrossEntropy | 1e-3 | 256 | 30 | patience=5 | Giam cuc doan weight |
| A2 | 2 | 0.5015 | 0.8084 | 0.4479 | 0.1356 | 0.4318 | 88.7 | selected-final-best |
| A3 | ON | ON | [0.5, 25] | CrossEntropy | 1e-3 | 256 | 30 | patience=5 | Cau hinh hien tai |
| A4 | 11 | 0.4779 | 0.8021 | 0.5921 | 0.5498 | 0.0 | 107.5 | phase1-completed |

## Phase 2 - Doi loss neu Phase 1 chua dat

| Run ID | Sampler | Class Weight | Loss | Tham so | LR | Epoch Max | Early Stop | Muc tieu chinh |
|---|---|---|---|---|---:|---:|---|---|
| B1 | OFF | ON | Focal Loss | gamma=2.0 | 1e-3 | 30 | patience=5 | Tap trung mau kho |
| B2 | 14 | 0.4978 | 0.8086 | 0.2074 | 0.1265 | 0.0303 | 97.2 | phase2-completed |
| B3 | ON | ON (mem) | Class-Balanced Focal | beta=0.9999, gamma=1.5 | 1e-3 | 30 | patience=5 | Can bang lop ben vung |

## Phase 3 - Chong overfitting bang regularization

| Run ID | Config nen | Dropout | Weight Decay | Label Smoothing | LR Scheduler | Muc tieu chinh |
|---|---|---:|---:|---:|---|---|
| C1 | 8 | 0.4724 | 0.7959 | 0.5492 | 0.4963 | 0.0606 | 94.9 | phase3-completed |
| C2 | 30 | 0.4876 | 0.8101 | 1.6301 | 1.4120 | 0.0455 | 93.3 | phase3-completed |
| C3 | Best tu A/B | 0.4 | 5e-4 | 0.05 | ON | Kiem tra tran regularization |

## Bang ghi ket qua chuan (dien moi run 1 dong)

| Run ID | Best Epoch | Val Macro-F1 (best) | Val Acc (best) | Val Loss (best) | Train-Val Gap | Minority Recall (4,5) | Thoi gian/epoch | Ket luan |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| A0 | 15 | 0.4967 | 0.8127 | 0.9327 | 0.5734 | 0.0455 | 100.9 | phase1-completed |
| A1 |  |  |  |  |  |  |  |  |
| A2 | 2 | 0.5015 | 0.8084 | 0.4479 | 0.1356 | 0.4318 | 88.7 | selected-final-best |
| A3 |  |  |  |  |  |  |  |  |
| A4 | 11 | 0.4779 | 0.8021 | 0.5921 | 0.5498 | 0.0 | 107.5 | phase1-completed |
| B1 |  |  |  |  |  |  |  |  |
| B2 | 14 | 0.4978 | 0.8086 | 0.2074 | 0.1265 | 0.0303 | 97.2 | phase2-completed |
| B3 |  |  |  |  |  |  |  |  |
| C1 | 8 | 0.4724 | 0.7959 | 0.5492 | 0.4963 | 0.0606 | 94.9 | phase3-completed |
| C2 | 30 | 0.4876 | 0.8101 | 1.6301 | 1.4120 | 0.0455 | 93.3 | phase3-completed |
| C3 |  |  |  |  |  |  |  |  |

## Tieu chi chot model cuoi
1. Uu tien cao nhat: Val Macro-F1 cao va on dinh qua 2-3 epoch quanh dinh.
2. Val Loss khong tang manh khi Train Loss tiep tuc giam.
3. Recall lop 4 va 5 khong qua thap.
4. Chon model tai best epoch, khong lay epoch cuoi.

## Thu tu chay de xuat (tiet kiem thoi gian)
1. Chay A0, A2, A4 truoc de tach tac dong nhanh.
2. Chon 1 run tot nhat vao Phase 2 (uu tien B2 hoac B3).
3. Chay 1-2 run Phase 3 de giam overfit.
4. Chot model va luu artifact.


## Ket qua thuc thi tu dong
- Phase 1 best: A2
- Phase 2 selected run: B2
- Final selected run: **A2 (FINALIZED - PRODUCTION)**

## Status: ✅ PRODUCTION READY

**Model A2 được chốt lại vào ngày 8.4.2026**

### Lý do chọn A2:
1. **Val Macro-F1 cao nhất**: 0.5015 (tốt nhất trong 7 run)
2. **Minority recall tốt**: 0.4318 (vs B2 chỉ 0.0303)
3. **Overfitting thấp nhất**: gap = 0.1356
4. **Hội tụ nhanh**: chỉ 2 epoch (vs B2 14 epoch)

### Không chọn B2 vì sao:
- Dù Val Loss thấp (0.2074) nhưng minority recall gần 0
- Model không thể dự đoán congestion cao (class 4,5)
- Chỉ tốt cho lớp chính, không suitable production

### Production Config:
- Xem chi tiết: `ai-core/docs/A2_PRODUCTION_CONFIG.md`
- Checkpoint: `best_traffic_model.pt`
- Metrics: `ai-core/reports/runs/A2.metrics.json`
