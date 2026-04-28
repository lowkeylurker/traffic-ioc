# Spec Task: Triển khai A-Z Pipeline Jupyter (00-06) cho ML + RL

Mục tiêu: tạo và hoàn thiện toàn bộ pipeline notebook theo kế hoạch tại `ai-core/docs/PIPELINE_JUPYTER_NOTEBOOK.md`, bảo đảm có thể chạy tuần tự từ tiền xử lý dữ liệu đến huấn luyện, đánh giá, và xuất báo cáo phục vụ triển khai thực tế.

## Kết quả kỳ vọng

- Có đầy đủ 7 notebook theo đúng vai trò: 00 (sandbox, tùy chọn), 01-06 (luồng chính).
- Luồng dữ liệu nhất quán qua các mốc:
  - `01_processed_features.parquet`
  - `02_balanced_training_data.parquet`
  - `preprocessing_artifacts.pkl`
  - `best_traffic_model_baseline.pt`
  - `dqn_traffic_best_model.pth`
  - bộ báo cáo đánh giá cuối (metrics/plots/report).
- Notebook 05 hỗ trợ rõ 2 chế độ:
  - pure RL (không cần baseline checkpoint)
  - warmstart RL (bắt buộc có baseline checkpoint)
- Notebook 06 đánh giá theo hướng vận hành thực tế: fatal errors, near-miss, PR/Recall lớp hiếm, SHAP, latency.

## Phạm vi thực hiện

- Trong phạm vi `ai-core`:
  - `ai-core/notebooks/`
  - `ai-core/docs/PIPELINE_JUPYTER_NOTEBOOK.md`
  - `ai-core/specs/task/`
- Tận dụng entrypoint production đã có khi phù hợp:
  - `ai-core/scripts/run_ml_train.py`
  - `ai-core/src/rl/training/runner.py`
- Không hardcode secrets; dùng biến môi trường.

## Danh sách notebook mục tiêu

- `00_EDA_Sandbox.ipynb` (tùy chọn)
- `01_Data_Extraction_Feature_Engineering.ipynb`
- `02_Hybrid_Resampling_and_CTGAN.ipynb`
- `03_ML_Training_and_Preprocessing_Artifacts.ipynb`
- `04_Environment_and_Model_Prototyping.ipynb`
- `05_Double_DQN_Training_Loop.ipynb`
- `06_Model_Evaluation_Error_Analysis_XAI.ipynb`

## A-Z Steps triển khai

### 1) Chuẩn hóa tài liệu và hợp đồng dữ liệu

- Chốt rõ đầu vào/đầu ra của từng notebook theo tài liệu pipeline.
- Chuẩn hóa naming và artifact path để tránh lệch giữa notebook và script production.
- Xác nhận rõ logic warmstart/pure trong notebook 05 trùng với runner hiện tại.

### 2) Hoàn thiện notebook 01 (Data Extraction + Feature Engineering)

- Kết nối DW, lọc `is_closed = false`, trích xuất đúng khung thời gian.
- Tạo và chuẩn hóa feature cốt lõi (`speed_ratio`, `speed_delta`, `ward_district_id`, các cột static/dynamic liên quan).
- Ràng buộc chất lượng dữ liệu:
  - label `congestion_level` trong miền `0..5`
  - xử lý missing có kiểm soát
  - validate schema trước khi export.
- Xuất `01_processed_features.parquet`.

### 3) Hoàn thiện notebook 02 (Hybrid Resampling + CTGAN)

- Áp dụng undersampling cho lớp 0/1/2 theo luật phạt-thưởng.
- Giữ nguyên lớp 3.
- Sinh thêm dữ liệu lớp 4/5 bằng CTGAN; có fallback khi CTGAN không khả dụng.
- Áp dụng sanity check vật lý cho dữ liệu synthetic trước khi merge.
- Xuất `02_balanced_training_data.parquet` và báo cáo class counts trước/sau.

### 4) Tạo/hoàn thiện notebook 03 (Baseline + Preprocessing Artifacts)

- Huấn luyện supervised baseline để có mốc đối chiếu.
- Xuất đồng thời:
  - `best_traffic_model_baseline.pt`
  - `preprocessing_artifacts.pkl`
  - `ml_metrics.json`
- Đảm bảo artifact có thể được nạp lại bởi pipeline inference và RL warmstart.
- Có thể gọi `scripts/run_ml_train.py` làm đường chạy production tương đương.

### 5) Tạo/hoàn thiện notebook 04 (RL Environment + Model Prototype)

- Định nghĩa `TrafficEnvironment` với reward logic rõ ràng.
- Khởi tạo `TrafficDQN` theo đúng input contract.
- Chạy dummy/mini-batch test để bắt lỗi shape/dtype/device sớm.
- Chốt cấu hình môi trường và mô hình sẵn sàng cho notebook 05.

### 6) Tạo/hoàn thiện notebook 05 (Double DQN Training Loop)

- Nạp dữ liệu cân bằng và artifacts.
- Hỗ trợ 2 chế độ huấn luyện:
  - pure mode: train RL từ đầu
  - warmstart mode: nạp trọng số từ `best_traffic_model_baseline.pt`
- Tích hợp logging/monitoring (metrics/history/checkpoint).
- Xuất `dqn_traffic_best_model.pth` và metrics đi kèm.

### 7) Tạo/hoàn thiện notebook 06 (Evaluation + XAI + System Metrics)

- Đánh giá mô hình theo yêu cầu vận hành:
  - confusion matrix chuẩn hóa + truy lỗi tử vong
  - near-miss accuracy
  - PR curve + recall lớp 4/5
  - SHAP cho mẫu mức 5
  - inference latency benchmark.
- Tổng hợp kết quả thành report markdown/html cho stakeholders.
- Đưa ra kết luận đạt/không đạt triển khai và khuyến nghị cải tiến.

### 8) Đồng bộ notebook với script production

- Mapping rõ cell/notebook nào tương đương bước nào trong script production.
- Đảm bảo đầu vào/đầu ra cùng chuẩn path và schema giữa notebook và script.
- Tránh tình trạng notebook chạy được nhưng script production vỡ contract.

### 9) Validation kỹ thuật notebook format

- Tất cả notebook JSON hợp lệ.
- Mỗi cell có:
  - `metadata.language`
  - `metadata.id` cho cell đã tồn tại.
- Có thể parse bằng `json.loads(...)` và kiểm tra cấu trúc tự động.

### 10) Nghiệm thu end-to-end

- Chạy theo thứ tự `00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 06`.
- Xác nhận toàn bộ artifact đầu ra tồn tại và đọc được.
- Xác nhận notebook 05 chạy được cả pure và warmstart.
- Xác nhận notebook 06 tạo đủ biểu đồ/chỉ số theo yêu cầu.

## Deliverables bắt buộc

- Notebook files trong `ai-core/notebooks/` theo danh sách mục tiêu.
- Tập artifacts đầu ra đầy đủ của 01/02/03/05/06.
- Report đánh giá cuối (markdown/html + plots).
- Tài liệu pipeline đã đồng bộ với trạng thái triển khai thực tế.

## Acceptance Criteria

- [ ] Có đầy đủ notebook 01-06, đúng vai trò theo kế hoạch.
- [ ] Notebook 01 xuất thành công `01_processed_features.parquet`.
- [ ] Notebook 02 xuất thành công `02_balanced_training_data.parquet` và có thống kê class trước/sau.
- [ ] Notebook 03 xuất được `best_traffic_model_baseline.pt`, `preprocessing_artifacts.pkl`, `ml_metrics.json`.
- [ ] Notebook 04 chạy qua được prototype test không lỗi shape/dtype/device.
- [ ] Notebook 05 chạy được cả pure mode và warmstart mode.
- [ ] Notebook 05 warmstart dùng đúng baseline checkpoint.
- [ ] Notebook 06 có confusion matrix, near-miss, PR/Recall lớp 4-5, SHAP, latency.
- [ ] Có báo cáo tổng hợp cuối phục vụ quyết định triển khai.
- [ ] Notebook JSON và metadata đạt yêu cầu format.

## Rủi ro và giảm thiểu

- Rủi ro: CTGAN không khả dụng hoặc sinh dữ liệu kém chất lượng.
  - Giảm thiểu: fallback augmentation + sanity check + log loại bỏ.
- Rủi ro: lệch contract giữa notebook và production scripts.
  - Giảm thiểu: mapping rõ path/schema, kiểm thử nạp artifact chéo.
- Rủi ro: metrics tổng đẹp nhưng lỗi vận hành nguy hiểm cao.
  - Giảm thiểu: bắt buộc theo dõi fatal errors, recall lớp hiếm, near-miss.
- Rủi ro: notebook hợp lệ logic nhưng sai format JSON/metadata.
  - Giảm thiểu: thêm bước validate cấu trúc notebook tự động.

## Thứ tự ưu tiên thực hiện

1. Chuẩn hóa dữ liệu và artifact flow: 01 -> 02 -> 03.
2. Ổn định huấn luyện RL: 04 -> 05.
3. Đánh giá vận hành + báo cáo: 06.
4. Tinh chỉnh sandbox 00 theo bài toán mới (nếu cần).

---

Spec task này là tài liệu chuẩn để bám theo trong quá trình hoàn thành kế hoạch từ A-Z.
