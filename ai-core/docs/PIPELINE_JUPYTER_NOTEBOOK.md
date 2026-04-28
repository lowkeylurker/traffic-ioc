# Kế hoạch Pipeline Jupyter Notebook (6 notebook chính + 1 sandbox tùy chọn)

Tài liệu này định nghĩa rõ vai trò của 6 notebook chính (01-06) trong luồng train ML + RL cho bài toán dự báo giao thông.
Notebook 00 là sandbox tiền trạm, tùy chọn nhưng rất nên có để thử nghiệm nhanh.
Mỗi notebook đều có đầu vào, đầu ra và phạm vi trách nhiệm riêng để tránh trùng lặp hoặc lỗ hổng quy trình.

## 1) 00_EDA_Sandbox.ipynb

Mục tiêu:
- Thử nghiệm nhanh trên mẫu dữ liệu nhỏ (ưu tiên gom nhiều mẫu lớp 4/5).
- Thử ý tưởng feature mới như speed_ratio, speed_delta, is_peak_hour.
- Kiểm tra tương quan và train nhanh baseline để xác định feature hữu ích.

Đầu vào:
- Mẫu dữ liệu trích từ DW (không cần full volume).
- Feature engineering snippets đang thử nghiệm.

Đầu ra:
- Không xuất dataset chính thức.
- Danh sách công thức feature đã được kiểm chứng.
- Quy tắc loại bỏ feature kém hiệu quả để đưa sang notebook 01.

Tiêu chí hoàn thành:
- Không còn lỗi logic cơ bản (chia cho 0, leakage, sai kiểu dữ liệu).
- Có kết luận rõ feature nào giữ, feature nào bỏ.

## 2) 01_Data_Extraction_Feature_Engineering.ipynb

Mục tiêu:
- Kết nối DW và trích xuất dữ liệu theo khung thời gian.
- Lọc bỏ road segment đóng: is_closed = false.
- Tạo bộ feature chuẩn và định nghĩa rõ static/dynamic columns.

Đầu vào:
- Bảng nguồn từ DW (ví dụ fact_traffic_flow, dim_segment).
- Cấu hình ngày bắt đầu, ngày kết thúc, corridor/segment filter.

Đầu ra:
- 01_processed_features.parquet.
- Schema feature contract (cột bắt buộc, kiểu dữ liệu, ràng buộc giá trị).

Tiêu chí hoàn thành:
- Label congestion_level được chuẩn hóa đúng miền 0..5.
- Không còn missing nghiêm trọng ở các cột bắt buộc.
- File parquet đọc được ở notebook 02 không cần vá chạm thủ công.

## 3) 02_Hybrid_Resampling_and_CTGAN.ipynb

Mục tiêu:
- Giải quyết mất cân bằng lớp cho bài toán 0..5.
- Undersample lớp 0/1/2 theo luật phạt-thưởng (transition + duplicate).
- Giữ nguyên lớp 3, bổ sung lớp 4/5 bằng CTGAN (có fallback).

Đầu vào:
- 01_processed_features.parquet.
- Cấu hình balancing: anchor class, cap ratio, transition multiplier, duplicate penalty.
- Cấu hình CTGAN: epochs, synthetic target cho class 4/5.

Đầu ra:
- 02_balanced_training_data.parquet.
- Báo cáo balancing (counts trước/sau, tỷ lệ giữ lại, số mẫu sinh thêm).

Tiêu chí hoàn thành:
- Class 3 được bảo toàn.
- Class 4/5 tăng đủ để train và không vi phạm sanity check vật lý.
- Log rõ fallback khi CTGAN không khả dụng.

## 4) 03_ML_Training_and_Preprocessing_Artifacts.ipynb

Mục tiêu:
- Train supervised baseline model để có mốc so sánh.
- Đóng gói preprocessing artifacts để RL và inference dùng chung contract.

Đầu vào:
- 02_balanced_training_data.parquet (hoặc tập đã xử lý tương đương).
- Cấu hình model baseline + hyperparameters.

Đầu ra:
- best_traffic_model_baseline.pt.
- preprocessing_artifacts.pkl.
- ml_metrics.json.

Tiêu chí hoàn thành:
- Pipeline train/inference có thể nạp lại artifacts mà không lỗi schema.
- Metrics baseline được lưu đầy đủ theo từng lớp.
- Có thể thay bằng entrypoint production scripts/run_ml_train.py khi cần.

## 5) 04_Environment_and_Model_Prototyping.ipynb

Mục tiêu:
- Định nghĩa TrafficEnvironment và reward logic cho RL.
- Khởi tạo mạng TrafficDQN (embedding + dense heads) theo đúng input contract.
- Chạy dry-run với dummy/mini batch để bắt shape mismatch sớm.

Đầu vào:
- preprocessing_artifacts.pkl.
- Mẫu dữ liệu đã cân bằng (subset từ notebook 02).
- RL config cơ bản (window size, action space, reward coefficients).

Đầu ra:
- Kịch bản prototype ổn định (environment step/reset + forward pass hợp lệ).
- Cấu hình model/env đã xác nhận sẵn sàng cho training loop.

Tiêu chí hoàn thành:
- Không còn runtime error về shape, dtype, device.
- Reward có xu hướng đúng theo domain expectation.

## 6) 05_Double_DQN_Training_Loop.ipynb

Mục tiêu:
- Train Double DQN trên dữ liệu đã cân bằng + artifacts đồng bộ.
- Theo dõi quá trình học bằng metrics và dashboard.
- Hỗ trợ 2 chế độ: pure RL (khởi tạo ngẫu nhiên) và warmstart RL (khởi tạo từ supervised checkpoint).

Đầu vào:
- 02_balanced_training_data.parquet.
- preprocessing_artifacts.pkl.
- best_traffic_model_baseline.pt (bắt buộc khi chạy warmstart; không bắt buộc khi chạy pure).
- RL environment + model prototypes đã xác nhận từ notebook 04.

Ghi chú chế độ:
- Pure mode: không cần baseline checkpoint, model RL học từ đầu.
- Warmstart mode: cần baseline checkpoint để nạp trọng số khởi tạo trước khi tiếp tục tối ưu bằng RL.

Đầu ra:
- dqn_traffic_best_model.pth.
- rl_metrics.json / history logs / checkpoint trung gian.

Tiêu chí hoàn thành:
- Training ổn định, không diverge.
- Có checkpoint tốt nhất theo metric mục tiêu (ví dụ recall class 4/5 hoặc composite score).

## 7) 06_Model_Evaluation_Error_Analysis_XAI.ipynb

Mục tiêu:
- Đánh giá mô hình từ góc nhìn vận hành thật, ưu tiên an toàn và khả năng cảnh báo sớm.

Đầu vào:
- dqn_traffic_best_model.pth (và/hoặc baseline model để so sánh).
- preprocessing_artifacts.pkl.
- Tập test out-of-time/out-of-corridor.

Đầu ra:
- Báo cáo confusion matrix chuẩn hóa + bảng fatal errors.
- Near-miss accuracy.
- PR curves + recall riêng cho class 4/5.
- SHAP report cho mẫu dự đoán mức 5.
- Latency benchmark (ms/predict) và tổng hợp markdown/html cho stakeholder.

Tiêu chí hoàn thành:
- Có kết luận rõ ràng: đạt/không đạt cho deployment.
- Nếu không đạt, chỉ rõ nguyên nhân và hành động ưu tiên tiếp theo.

## Ghi chú vận hành quan trọng

- Thứ tự chạy khuyến nghị: 00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 06.
- Notebook 03 có thể được thay bằng scripts/run_ml_train.py trong production.
- Nếu chạy 05 theo warmstart, đảm bảo đường dẫn checkpoint baseline trỏ đúng file best_traffic_model_baseline.pt.
- Mỗi đầu ra cần có timestamp/run_id để truy vết.
- Không hardcode secrets; đọc từ biến môi trường.