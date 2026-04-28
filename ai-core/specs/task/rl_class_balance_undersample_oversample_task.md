# Spec: Tích hợp cân bằng nhãn dữ liệu RL (Undersample 0-2, giữ 3, Oversample 4-5)

Mục tiêu: triển khai end-to-end workflow cân bằng nhãn dữ liệu theo `ai-core/docs/CAN_BANG_CLASS.md` / `ai-core/docs/Cat_tia_va_Sinh_them_du_lieu.md`, để tạo ra dataset RL cuối cùng đã được cắt tỉa, tạo sinh, kiểm tra vật lý và xuất `.parquet` sẵn sàng cho môi trường huấn luyện.

## Kết quả kỳ vọng

- Tầng 1: Undersampling Mức 0, 1, 2 theo anchor `count[3] = 90,286`, cap đồng đều `2.5M`, có vá lỗi cho transition và duplicate.
- Tầng 2: Giữ nguyên 100% Mức 3, không cắt tỉa, không sinh thêm.
- Tầng 3: Oversampling Mức 4, 5 bằng pipeline 2 bước: Gaussian augmentation → CTGAN/CTGANSynthesizer.
- Tầng 4: Sanity check vật lý, reshape tensor dynamic về `(12, 5)`, merge toàn bộ và xuất `.parquet`.
- CLI / runner: có thể bật/tắt cân bằng dữ liệu bằng config/env, log rõ số lượng trước/sau mỗi lớp.
- Tests: có unit/integration test cho probability cap, duplicate detection MAE, sanity check, export parquet.

## Phạm vi và quy ước

- Target label: `congestion_level` với 6 lớp `0..5`.
- Dataset RL đầu vào hiện tại đi qua `scripts/run_ml_train.py` và `src/rl/training/runner.py`.
- Các thao tác mới phải giữ tương thích với `TrafficDataset`, `prepare_dataloaders`, và pipeline train RL hiện có.
- Mọi sampling / synthesis đều phải có seed tái lập được.
- Không được tạo ra lớp 2 mới bị phình to ngoài ý muốn; không được làm mất transition windows quan trọng.
- Chỉ oversample dữ liệu mức 4/5 sau khi đã tách riêng, sanitize và reshape đầy đủ.

## File / module mục tiêu

- `ai-core/src/rl/training/runner.py` — logic điều phối cân bằng ở runtime.
- `ai-core/scripts/run_ml_train.py` — hook bật/tắt balancing khi train supervised + RL.
- `ai-core/src/ml/data/dataset.py` — dataset nhận file `.parquet` đã cân bằng.
- `ai-core/src/utils/data_loader.py` — nạp dữ liệu corridor/segment cho các stage cân bằng.
- `ai-core/src/utils/preprocessing.py` — nếu cần biến đổi phục vụ flatten/reshape.
- `ai-core/src/rl/data_balance/` — module mới đề xuất cho undersample / oversample / sanity-check / merge.
- `ai-core/tests/test_class_balance.py` — unit tests cho pipeline mới.
- `ai-core/tests/test_rl_training_balance.py` — integration smoke test với runner.
- `ai-core/reports/` hoặc `ai-core/artifacts/` — output parquet, logs, metrics.

## A→Z Steps (chi tiết)

### 1) Thiết kế hợp đồng dữ liệu cân bằng
- Xác định schema đầu vào và đầu ra của từng stage.
- Chốt các trường bắt buộc:
  - `segment_key`, `timestamp`, `congestion_level`
  - static/categorical columns
  - dynamic window columns `(12, 5)` hoặc cấu trúc tương đương trước khi flatten
- Định nghĩa metadata đi kèm:
  - `source_stage`
  - `sampling_reason`
  - `synthetic_flag`
  - `sanity_check_passed`
  - `balance_seed`

### 2) Tầng 1 — Undersample Mức 0, 1, 2
- Implement module / function để:
  - lấy anchor `M = count[3] = 90,286`
  - đặt cap mục tiêu đồng đều cho 0,1,2 là `2.5M`
  - tính `P_base` cho từng lớp theo tỉ lệ cap / count hiện tại
  - áp dụng bộ hiệu chỉnh:
    - transition window: `min(1.0, P_base * 1.30)`
    - duplicate window: `min(1.0, P_base * 0.20)`
    - khác: `P_base`
- Duplicate detection phải dùng so sánh sai số số thực (MAE / tolerance), không dùng `==`.
- Lưu log thống kê:
  - số dòng trước/sau theo class
  - số transition được giữ
  - số duplicate bị giảm
  - keep probability cuối cùng theo lớp
- Dữ liệu output của stage này vẫn giữ format sẵn sàng ghép sang stage 2 và 4.

### 3) Tầng 2 — Giữ nguyên Mức 3
- Mức 3 phải được bảo toàn 100%.
- Không áp dụng bất kỳ random sampling, augmentation, hay CTGAN nào cho lớp này.
- Chỉ ghi nhận metric kiểm tra: số dòng đầu vào = số dòng đầu ra.
- Nếu phát hiện bị thay đổi số lượng lớp 3, stage phải fail sớm.

### 4) Tầng 3 — Oversample Mức 4, 5
- Tách riêng dữ liệu mức 4 và 5 trước khi sinh.
- Flatten dynamic tensor `(12, 5)` thành 60 cột 1D, giữ static/categorical columns đi kèm.
- Mức 5:
  - augment cơ học với Gaussian noise ±2% trên biến liên tục
  - tăng từ 437 dòng gốc lên khoảng 2,000 dòng
  - train `CTGANSynthesizer` để sinh thêm ~20,000 dòng
- Mức 4:
  - train CTGAN trên 5,276 dòng gốc
  - sinh thêm ~50,000 dòng
- Sinh dữ liệu phải có khả năng cấu hình số lượng output theo runtime config, không hardcode tuyệt đối.
- Ghi nhãn synthetic rõ ràng để dễ audit.

### 5) Hậu kiểm vật lý (sanity check)
- Implement / tích hợp `physics_sanity_check()` cho toàn bộ dữ liệu synthetic.
- Loại bỏ ngay các dòng có:
  - `speed < 0`
  - `volume < 0`
  - mật độ / lưu lượng / nhãn mâu thuẫn vật lý rõ ràng
- Ghi log số lượng dòng bị loại và lý do chính.
- Chỉ những dòng pass sanity check mới được đưa sang stage merge.

### 6) Tái cấu trúc dynamic tensor
- Sau sanity check, reshape 60 cột dynamic về lại tensor `(12, 5)`.
- Đảm bảo mapping cột flatten/reshape là deterministic và có test đối xứng round-trip.
- Nếu reshape thất bại hoặc thiếu cột, stage phải fail rõ ràng.

### 7) Hợp nhất và shuffle
- Concatenate 3 nguồn dữ liệu:
  - undersampled 0-2
  - full 3
  - oversampled 4-5 sau sanity check
- Shuffle toàn bộ dataset bằng seed cố định.
- Gắn metadata provenance để biết sample đến từ stage nào.
- Xuất bản final dataset ra `.parquet`.

### 8) Tích hợp vào training pipeline
- Cập nhật `scripts/run_ml_train.py` hoặc `src/rl/training/runner.py` để:
  - bật/tắt pipeline cân bằng bằng env/config
  - load dataset `.parquet` đã chuẩn hoá
  - log summary class counts trước/sau
- Nếu bật balancing, training phải dùng dataset sau pipeline mới; nếu tắt, giữ luồng cũ.
- Cần hỗ trợ mode dry-run để chỉ in stats mà không ghi output.

### 9) Tests & validation
- Thêm test cho:
  - probability capping không vượt 1.0
  - duplicate detection dựa trên MAE / tolerance
  - Mức 3 không bị thay đổi số lượng
  - sanity check loại bỏ mẫu vô lý
  - flatten/reshape round-trip giữ nguyên kích thước
  - parquet export / import đọc lại được schema
- Thêm integration smoke test cho runner với balancing bật.

### 10) Observability & audit
- Ghi ra report JSON/CSV cho mỗi lần chạy:
  - class counts before/after
  - keep probabilities theo lớp
  - số synthetic rows theo stage
  - số rows removed by sanity check
  - final parquet path
- Nếu pipeline bị dừng giữa chừng, phải lưu checkpoint trung gian để có thể resume.

## Quy tắc quyết định

### Tầng 1
- Mục tiêu: tiết kiệm tài nguyên nhưng không phá transition.
- Cap chung cho 0/1/2: `2.5M`.
- Duplicate penalty: `x 0.20`.
- Transition bonus: `x 1.30`.
- Tất cả probability cuối cùng phải `min(1.0, ...)`.

### Tầng 2
- Mục tiêu: bảo toàn toàn bộ lớp 3.
- Nếu số lượng lớp 3 đầu ra khác đầu vào → fail.

### Tầng 3
- Mục tiêu: bù kinh nghiệm thảm họa cho 4/5.
- Mức 5 ưu tiên augmentation + CTGAN trước.
- Mức 4 có thể CTGAN trực tiếp.
- Sanity check là bắt buộc, không được bỏ qua.

### Tầng 4
- Dataset cuối phải là nguồn duy nhất mà training đọc vào khi balancing được bật.
- `.parquet` phải load được nhanh và ổn định.

## Command / entry point gợi ý

- `python -m src.rl.training.runner --mode pure --use-window-balancing 1`
- `python scripts/run_ml_train.py` với flag/env bật pipeline cân bằng
- `python -m src.rl.data_balance.build_balanced_dataset --input ... --output ...`

## Acceptance criteria

- [ ] Mức 0, 1, 2 được undersample theo cap `2.5M` với transition bonus và duplicate penalty.
- [ ] Mức 3 luôn được giữ nguyên 100%.
- [ ] Mức 4, 5 được oversample theo pipeline augmentation + CTGAN.
- [ ] Dữ liệu synthetic pass physics sanity check trước khi merge.
- [ ] Dataset cuối được shuffle và xuất `.parquet`.
- [ ] Training pipeline đọc được dataset mới mà không vỡ contract.
- [ ] Unit/integration tests pass.
- [ ] Có report audit cho mỗi lần chạy.

## Rủi ro & giảm thiểu

- **Rủi ro**: CTGAN sinh mẫu không hợp lý.
  - **Giảm thiểu**: sanity check bắt buộc + lưu log loại bỏ.
- **Rủi ro**: undersampling làm mất transition quan trọng.
  - **Giảm thiểu**: transition bonus và kiểm tra thống kê sau sampling.
- **Rủi ro**: thay đổi schema làm vỡ training.
  - **Giảm thiểu**: contract rõ ràng và test round-trip parquet.
- **Rủi ro**: sampling không tái lập được.
  - **Giảm thiểu**: seed cố định, log seed trong metadata.

## Timeline gợi ý

- Ngày 1: thiết kế contract, scaffold module balance pipeline
- Ngày 2: implement undersampling stage + tests
- Ngày 3: implement oversampling stage + sanity check
- Ngày 4: merge, parquet export, integration với training
- Ngày 5: validation trên sample/staging và chốt audit report

---

Spec này là bản kế hoạch A→Z để hiện thực hoá toàn bộ pipeline cân bằng nhãn dữ liệu RL theo `CAN_BANG_CLASS.md`.
