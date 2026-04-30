# Spec Task: Triển khai A-Z Pipeline Jupyter (00-06) theo hướng Reuse-First cho ML + RL

Mục tiêu: hoàn thiện pipeline notebook 00-06 theo nguyên tắc ưu tiên tái sử dụng module Python đã có. Notebook chỉ đóng vai trò orchestration, cấu hình, và trực quan kết quả; không chứa business logic dài hoặc logic train cốt lõi bị copy/paste.

## Nguyên tắc kiến trúc bắt buộc

1. Reuse-first:
- Mọi bước ETL, balancing, train, evaluate phải ưu tiên gọi module/script hiện có trong codebase.
- Chỉ viết module mới khi xác nhận chưa có implementation phù hợp.

2. Notebook-thin:
- Notebook chỉ gồm: config, gọi hàm/entrypoint, kiểm tra output, visualize/report.
- Logic nghiệp vụ chính phải nằm trong module dưới `src/` hoặc script dưới `scripts/`.

3. Production parity:
- Đầu vào/đầu ra notebook phải cùng contract với luồng production (path, schema, artifact name).
- Notebook chạy được không đồng nghĩa xong nếu script production không chạy cùng contract.

4. Không hardcode secrets:
- Chỉ dùng biến môi trường cho DB/API/credentials.

## Trạng thái thực thi hiện tại

- [x] Đã có khung notebook 01-06 và validate format JSON/metadata cơ bản.
- [ ] Chưa hoàn tất refactor theo hướng notebook chỉ gọi module.
- [ ] Chưa có bảng mapping chính thức notebook -> module/script tái sử dụng.
- [ ] Chưa đóng các khoảng trống module còn thiếu cho toàn bộ pipeline.
- [ ] Chưa nghiệm thu end-to-end trên dữ liệu thật.

## Phạm vi thực hiện

- Trong phạm vi `ai-core`:
  - `notebooks/`
  - `src/`
  - `scripts/`
  - `docs/PIPELINE_JUPYTER_NOTEBOOK.md`
  - `specs/task/`

## Danh sách notebook mục tiêu

- `00_EDA_Sandbox.ipynb` (bắt buộc)
- `01_Data_Extraction_Feature_Engineering.ipynb`
- `02_Hybrid_Resampling_and_CTGAN.ipynb`
- `03_ML_Training_and_Preprocessing_Artifacts.ipynb`
- `04_Environment_and_Model_Prototyping.ipynb`
- `05_Double_DQN_Training_Loop.ipynb`
- `06_Model_Evaluation_Error_Analysis_XAI.ipynb`

## Artifacts chuẩn cần tạo

- `01_processed_features.parquet`
- `02_balanced_training_data.parquet`
- `preprocessing_artifacts.pkl`
- `best_traffic_model_baseline.pt`
- `dqn_traffic_best_model.pth`
- metrics + plots + report tổng hợp cuối.

## A-Z Steps triển khai (phiên bản Reuse-First)

### 1) Lập bản đồ tái sử dụng module (Module Reuse Map)

- Tạo ma trận mapping cho từng notebook:
  - bước nghiệp vụ,
  - module/script hiện có có thể dùng,
  - khoảng trống chưa có module.
- Chốt nguyên tắc: không viết logic dài trong cell nếu đã có hàm/module tương đương.

### 2) Chuẩn hóa contract dữ liệu và artifact

- Chốt schema đầu vào/đầu ra cho từng stage 01->06.
- Đồng bộ naming/path artifacts giữa notebook và script production.
- Chuẩn hóa warmstart/pure contract theo runner RL hiện tại.

### 3) Refactor notebook 00 theo hướng EDA và Feature Selection

- Notebook 00 thực hiện EDA trên mẫu dữ liệu.
- Đánh giá độ quan trọng của feature sơ bộ (dùng Random Forest hoặc tương quan).
- Chốt danh sách feature tinh chỉnh trước khi đưa vào ETL chính thức.
- Đảm bảo gọi module từ `src/data_access` để load mẫu.

### 4) Refactor notebook 01 theo hướng gọi module ETL

- Notebook 01 chỉ gọi hàm ETL/feature engineering từ module.
- Nếu chưa có module ETL chuẩn, tạo module mới (ví dụ trong `src/data_access` hoặc `src/features`) rồi notebook gọi lại.
- Đảm bảo output chuẩn: `01_processed_features.parquet`.

### 4) Refactor notebook 02 theo hướng gọi module balancing

- Tái sử dụng pipeline balancing hiện có trước.
- Nếu còn thiếu cho CTGAN/fallback/sanity-check, bổ sung module riêng trong `src/rl/data_balance` (hoặc vị trí phù hợp).
- Notebook 02 chỉ điều phối và hiển thị phân phối class trước/sau.

### 5) Refactor notebook 03 theo hướng gọi training entrypoint

- Ưu tiên dùng script/module train baseline hiện có.
- Notebook 03 thực hiện gọi train + hiển thị metrics + xác nhận artifact:
  - `best_traffic_model_baseline.pt`
  - `preprocessing_artifacts.pkl`
  - `ml_metrics.json`

### 6) Refactor notebook 04 theo hướng gọi module env/model

- Notebook 04 chỉ gọi module tạo environment và model prototype.
- Giữ lại test tối thiểu shape/dtype/device ở mức orchestration.

### 7) Refactor notebook 05 theo hướng gọi RL runner

- Dùng RL runner/module train hiện có làm trục chính.
- Notebook chỉ quản lý config và gọi train ở 2 mode:
  - pure RL
  - warmstart RL
- Xác nhận warmstart thực sự nạp baseline checkpoint đúng contract.

### 8) Refactor notebook 06 theo hướng gọi module evaluation/XAI

- Tái sử dụng module đánh giá hiện có nếu có.
- Nếu thiếu, bổ sung module mới cho metrics vận hành (fatal errors, near-miss, PR/Recall lớp 4/5, latency, SHAP).
- Notebook 06 tập trung tổng hợp report và quyết định triển khai.

### 9) Bổ sung module thiếu (Gap Closure)

- Với từng khoảng trống ở bước 1, tạo module Python mới có:
  - interface rõ ràng,
  - docstring,
  - input/output contract,
  - test tối thiểu.
- Sau khi có module mới, thay toàn bộ logic tương ứng trong notebook bằng lời gọi module.

### 10) Validation định dạng notebook + validation chức năng

- Format:
  - Notebook JSON hợp lệ.
  - Mỗi cell có `metadata.language`.
  - Cell đã tồn tại có `metadata.id`.
- Function:
  - Chạy tuần tự 00->06 (hoặc 01->06 nếu bỏ 00).
  - Xác nhận artifact tồn tại, đọc lại được, đúng schema.
  - Xác nhận notebook 05 chạy được pure và warmstart.

## Mapping bắt buộc notebook -> module/script

Mỗi notebook phải có bảng mapping trong docs/spec gồm:
- Notebook step.
- Hàm/module/script được gọi.
- Đầu vào.
- Đầu ra.
- Trạng thái: reused/newly-added.

Không có bảng mapping này thì chưa nghiệm thu.

## Deliverables bắt buộc

- 01 bản spec/task đã cập nhật theo reuse-first (file này).
- 01 bảng module reuse map cho notebook 01-06: `ai-core/specs/task/module_reuse_map_notebooks_01_06.md`.
- Notebook 01-06 đã refactor: cell business logic dài được thay bằng lời gọi module/script.
- Module mới (nếu cần) + test tối thiểu cho module mới.
- Bộ artifacts đầy đủ của luồng 01/02/03/05/06.
- Report đánh giá cuối (markdown/html + plots).

## Acceptance Criteria (phiên bản Reuse-First)

- [ ] Notebook 01-06 tồn tại và đúng vai trò.
- [ ] Mỗi notebook chỉ còn orchestration logic; business logic chính nằm trong module/script.
- [ ] Có bảng mapping notebook -> module/script cho toàn bộ 01-06.
- [ ] Mọi phần có thể tái sử dụng đã dùng lại module hiện có; phần thiếu đã bổ sung module mới.
- [ ] Notebook 01 xuất `01_processed_features.parquet` đúng contract.
- [ ] Notebook 02 xuất `02_balanced_training_data.parquet` và có class distribution trước/sau.
- [ ] Notebook 03 xuất đủ baseline artifacts (`best_traffic_model_baseline.pt`, `preprocessing_artifacts.pkl`, `ml_metrics.json`).
- [ ] Notebook 04 chạy qua prototype checks (shape/dtype/device).
- [ ] Notebook 05 chạy được pure và warmstart, warmstart nạp đúng checkpoint baseline.
- [ ] Notebook 06 xuất đủ metrics vận hành + XAI + latency report.
- [ ] Notebook JSON/metadata đạt chuẩn format.

## Rủi ro và giảm thiểu

- Rủi ro: notebook vẫn chứa logic copy từ module.
  - Giảm thiểu: review bắt buộc theo tiêu chí notebook-thin trước khi nghiệm thu.
- Rủi ro: thiếu module trung gian khiến notebook phải viết tạm logic.
  - Giảm thiểu: ưu tiên đóng gap module ở bước 9 trước khi mở rộng notebook.
- Rủi ro: lệch contract giữa notebook và production.
  - Giảm thiểu: bắt buộc reuse entrypoint production và kiểm thử artifact load chéo.
- Rủi ro: CTGAN không khả dụng.
  - Giảm thiểu: fallback augmentation + sanity-check + logging loại bỏ mẫu.

## Thứ tự ưu tiên thực hiện

1. Lập module reuse map + chuẩn hóa contract.
2. Refactor 01->03 theo reuse-first để khóa data/artifact flow.
3. Refactor 04->05 để ổn định RL train pure/warmstart.
4. Refactor 06 để hoàn chỉnh đánh giá vận hành và báo cáo.
5. Chạy nghiệm thu end-to-end.

---

Spec task này là tài liệu chuẩn để triển khai A-Z pipeline notebook theo nguyên tắc: tận dụng tối đa module Python hiện có, chỉ bổ sung module mới khi thực sự thiếu, và giữ notebook ở vai trò điều phối.
