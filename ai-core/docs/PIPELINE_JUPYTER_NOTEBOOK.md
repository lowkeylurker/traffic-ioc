### 🛠️ Nhóm Tiền Trạm (Phân tích & Thử nghiệm)

-   **`00_EDA_Sandbox.ipynb` (Sân chơi Sáng tạo)**

    -   *Mục đích:* Nơi bạn vẽ biểu đồ, nháp code, test các ý tưởng Feature Engineering mới (như xem `speed_delta` có phân phối tốt không) hoặc chạy SHAP. Code ở đây có thể lộn xộn, khi nào chốt công thức mới mang sang Notebook 1.

### ⚙️ Nhóm Data Pipeline (Chuẩn bị Dữ liệu)

-   **`01_Data_Extraction_Feature_Engineering.ipynb` (Trạm Lọc & Nhào nặn)**

    -   *Mục đích:* Kết nối Data Warehouse, lọc bỏ đường đóng (`is_closed = false`), tạo đặc trưng mới (`speed_ratio`, `ward_district_id`), và xuất ra tệp `01_processed_features.parquet`. File này chứa code cực kỳ sạch, chạy tự động từ trên xuống dưới.

-   **`02_Hybrid_Resampling_and_CTGAN.ipynb` (Trạm Cân bằng Sinh tạo)**

    -   *Mục đích:* Áp dụng thuật toán Undersampling (cắt tỉa mức 0,1,2 với luật phạt/thưởng), giữ nguyên mức 3, và huấn luyện CTGAN sinh thêm dữ liệu mức 4,5. Xuất ra tệp dữ liệu vàng `02_balanced_training_data.parquet`.

### 🧠 Nhóm Lõi AI (Môi trường & Huấn luyện)

-   **`03_Environment_and_Model_Prototyping.ipynb` (Xưởng Lắp ráp & Test Logic)**

    -   *Mục đích:* Xây dựng class `TrafficEnvironment` (luật tính Reward, cấu hình Step/Reset) và class mạng Nơ-ron `TrafficDQN` (cấu hình các lớp `nn.Embedding`). Đây là nơi chạy thử 1 mẻ (batch) để đảm bảo không có lỗi chênh lệch ma trận (shape mismatch) trước khi đưa vào train thật.

-   **`04_Double_DQN_Training_Loop.ipynb` (Lò Luyện Não bộ)**

    -   *Mục đích:* Load tệp dữ liệu cân bằng, khởi tạo Replay Buffer, và chạy vòng lặp huấn luyện chính (`for episode in epochs`). Tích hợp công cụ vẽ biểu đồ Loss theo thời gian thực và xuất ra file tệp trọng số `dqn_traffic_best_model.pth`.

### 🔬 Nhóm Đánh giá (Kiểm định Chất lượng)

-   **`05_Evaluation_and_Inference.ipynb` (Trạm Giám định)**

    -   *Mục đích:* Load tệp trọng số tốt nhất, chạy dự báo trên tập dữ liệu Test hoàn toàn mới. Tính toán các chỉ số toán học (F1-Score, Recall) và phân tích các ca AI dự báo sai thảm hại để tìm cách tối ưu tiếp.