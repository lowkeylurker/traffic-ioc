**CHƯƠNG 5: HỆ THỐNG TRÍ TUỆ NHÂN TẠO & DỰ BÁO GIAO THÔNG (📌 Phụ trách: Dũng)** *(Đây là chương "nặng ký" và mang tính học thuật cao nhất của ĐATN)*

**5.1. Tổng quan và Phân tích các phương pháp tiếp cận (Literature Review)** 
*(💡 Gợi ý cho Gemini: Hãy viết phần này như một bài tiểu luận nghiên cứu khoa học, sử dụng ngôn ngữ học thuật. So sánh các phương pháp dựa trên 3 tiêu chí: Khả năng bắt giữ phụ thuộc thời gian, Khả năng xử lý dữ liệu phi cấu trúc, và Mục tiêu tối ưu hóa.)*

-   **5.1.1. Tiếp cận dựa trên Thống kê truyền thống (ARIMA, SARIMA):** 
    *   *Nội dung cần triển khai:* Phân tích nguyên lý dựa trên tính dừng (stationarity) của chuỗi thời gian. 
    *   *Khuyết điểm:* Nhấn mạnh việc không bắt được "điểm gãy" phi tuyến tính khi có kẹt xe đột ngột.
    *   *📷 Hình ảnh gợi ý:* Chèn biểu đồ đường (Line Chart) so sánh kết quả dự báo của ARIMA bị "trễ" (lag) so với thực tế khi có biến động mạnh.

-   **5.1.2. Tiếp cận dựa trên Deep Learning (LSTM, CNN, T-GCN):** 
    *   *Nội dung cần triển khai:* Giải thích tại sao LSTM phù hợp với chuỗi thời gian. Phân tích vấn đề "Thiên kiến lớp đa số" (Majority Class Bias) khi dùng hàm Loss chuẩn (MSE/Cross-Entropy).
    *   *📷 Hình ảnh gợi ý:* Chèn sơ đồ khối kiến trúc LSTM đơn giản và một biểu đồ Confusion Matrix của mô hình DL thuần túy để cho thấy Recall ở lớp kẹt xe nặng rất thấp.

-   **5.1.3. Đề xuất Kiến trúc Lai (Hybrid SL-to-RL Transfer):**
    *   *Nội dung cần triển khai (Thông tin kỹ thuật cốt lõi cho Gemini):* 
        *   **Cấu trúc mạng Fusion (Mô hình SL):** Sử dụng mạng nơ-ron đa nhánh: 
            1. Nhánh Dynamic (Chuỗi thời gian): LSTM 2 lớp (hidden_dim=64).
            2. Nhánh Categorical (Bối cảnh): Sử dụng các tầng Embedding (dim=8) để mã hóa ID đoạn đường, phường/xã.
            3. Nhánh Static (Đặc trưng tĩnh): Mạng FNN xử lý tọa độ và các thông số vật lý của đường.
        *   **Cơ chế Học tăng cường (DQN Agent):** Áp dụng **Double DQN** với Replay Buffer (100k samples) và Target Network để ổn định quá trình hội tụ.
        *   **Hàm thưởng (Reward Shaping) - Bí quyết của hệ thống:** Giải thích logic hàm thưởng không đối xứng: 
            - Nếu dự báo đúng mức kẹt xe: +2 điểm.
            - Nếu dự báo sai lệch nhẹ: -1 điểm.
            - **ĐẶC BIỆT:** Nếu thực tế kẹt xe thảm họa (Level 4, 5) mà mô hình dự báo là thông thoáng (Level 0, 1) -> Phạt cực nặng (-10 đến -20 điểm) để ép Agent phải nhạy bén với thảm họa.
        *   **Quy trình Warmstart:** Giải thích việc nạp trọng số (weights) từ mô hình SL đã train trên Cross-Entropy vào Agent DQN trước khi bắt đầu giai đoạn RL Fine-tuning.
    *   *📷 Hình ảnh gợi ý:* 
        1. **Sơ đồ kiến trúc tổng thể:** Thể hiện sự kết hợp giữa LSTM và các tầng Embedding hội tụ về Classifier.
        2. **Đồ thị biểu diễn hàm thưởng:** Vẽ đồ thị dốc đứng thể hiện mức phạt tăng vọt khi lỗi dự báo rơi vào nhóm "Under-prediction" ở lớp kẹt xe nặng.
    *   *Ưu/Khuyết điểm:* (Nhấn mạnh việc hội tụ nhanh nhờ Warmstart và khả năng bắt kẹt xe nặng nhờ Reward Shaping).

**5.2. Kỹ thuật Thiết kế Đặc trưng (Feature Engineering & Justification)**

-   **5.2.1. Cửa sổ trượt (Sliding Window):** Tại sao chọn window size = 12? (Dựa trên thực nghiệm, thời gian quá ngắn sẽ thiếu thông tin, quá dài sẽ gây nhiễu).
-   **5.2.2. Nhúng không gian (Spatial Embedding) vs. One-Hot Encoding:** *So sánh:* One-hot gây bùng nổ số chiều (Curse of dimensionality) và ma trận thưa (Sparse matrix). *Giải pháp:* Dùng `nn.Embedding` để nén các phường/xã thành vector dày đặc (Dense vector), giúp AI học được sự tương đồng về không gian giao thông.

**5.3. Chiến lược Cân bằng Dữ liệu (Resampling Comparative Analysis)**

-   **5.3.1. Phân tích điểm yếu của các phương pháp truyền thống:** Tại sao KHÔNG dùng SMOTE hay ADASYN? (SMOTE chỉ nội suy tuyến tính, tạo ra dữ liệu ảo phi vật lý khi áp dụng cho dữ liệu giao thông phức tạp).
-   **5.3.2. Ưu điểm của CTGAN (Conditional Tabular GAN):** CTGAN học được phân phối đa chiều thực sự của dữ liệu.
-   **5.3.3. Hạn chế của CTGAN và Cách khắc phục:** *Khuyết điểm:* CTGAN có thể sinh ra hiện tượng "ảo giác" (Hallucination - ví dụ: trời mưa to, giờ cao điểm nhưng tốc độ 80km/h). *Cách khắc phục:* Áp dụng "Màng lọc Hậu kiểm Vật lý" (Sanity Check) sau khi sinh dữ liệu để loại bỏ các mẫu vô lý.

**5.4. Trạm tiền huấn luyện Giám sát (Supervised Baseline Justification)**

-   **5.4.1. Lựa chọn thuật toán ML:** Tại sao chọn XGBoost làm Baseline? (Xử lý tốt dữ liệu dạng bảng, kháng nhiễu tốt, tốc độ hội tụ nhanh).
-   **5.4.2. Vấn đề "Khởi động lạnh" (Cold Start) trong RL:** *Khuyết điểm của RL:* Nếu khởi tạo trọng số ngẫu nhiên, Agent sẽ mất cực kỳ nhiều thời gian để mò mẫm quy luật vật lý cơ bản, dễ rơi vào cực tiểu cục bộ.
-   **5.4.3. Giải pháp Học chuyển giao (Transfer Learning):** Đóng gói não bộ ML thành `preprocessing_artifacts` và tiêm trọng số (weights) thẳng vào Agent DQN để khắc phục điểm yếu Cold Start.

**5.5. Kiến trúc Đặc vụ Học tăng cường (Double DQN Architecture)**

-   **5.5.1. Tại sao là DQN mà không phải thuật toán RL khác (như PPO, SAC)?** DQN phù hợp với không gian hành động rời rạc (Discrete Actions - 6 nhãn kẹt xe).
-   **5.5.2. Khuyết điểm của DQN truyền thống và Cách khắc phục:** *Khuyết điểm:* DQN bị hội chứng "Overestimation Bias" (Ảo tưởng sức mạnh) - đánh giá quá cao giá trị Q của một hành động do dùng cùng một mạng để chọn và đánh giá. *Giải pháp:* Sử dụng **Double DQN** (Tách Policy Net và Target Net) để triệt tiêu sự ảo tưởng này, giúp Agent học ổn định hơn.
-   **5.5.3. Thiết kế Hàm Phần thưởng (Reward Shaping):** Trình bày ma trận phạt không đối xứng (Phạt cực nặng khi dự đoán thông thoáng nhưng thực tế là thảm họa).

**5.6. Đánh giá Thực nghiệm và So sánh (Empirical Evaluation & Benchmarking)** *(Đây là phần bắt buộc để chứng minh tính khoa học - Hãy trình bày dưới dạng bảng/biểu đồ)*

-   **5.6.1. Thiết lập các mô hình Cơ sở (Baselines):** So sánh kết quả thực tế của mô hình Đề xuất với:
    -   Mô hình chỉ dùng XGBoost (Không RL).
    -   Mô hình LSTM chuẩn (Không cân bằng dữ liệu).
-   **5.6.2. Phân tích Chỉ số (Metrics Analysis):** Không dùng Accuracy. So sánh F1-Score, Recall ở Lớp 4 và 5, PR-AUC. Chứng minh phương pháp Lai vọt lên hẳn về Recall ở nhóm thảm họa so với LSTM chuẩn.
-   **5.6.3. Giải thích tính minh bạch (XAI - SHAP):** *Khuyết điểm chung của Deep Learning:* Hộp đen (Black-box). *Giải pháp:* Áp dụng SHAP để giải thích quyết định của mô hình, chứng minh nó ra quyết định dựa trên gia tốc/thời tiết chứ không phải học vẹt.

**5.7. Hạn chế của Hệ thống đề xuất và Hướng phát triển** *(Hội đồng cực kỳ đánh giá cao sinh viên biết rõ giới hạn của mô hình mình làm)*

-   **Hạn chế 1 (Độ trễ - Latency):** Pipeline qua nhiều bước (Scaler -> RL Inference) có thể làm tăng độ trễ miligiây. *Hướng khắc phục:* Tối ưu hóa TensorRT hoặc chuyển đổi sang định dạng ONNX khi deploy.
-   **Hạn chế 2 (Phụ thuộc chất lượng dữ liệu đo đạc):** Cảm biến (Sensor) đứt mạng sẽ làm hỏng Sliding Window. *Hướng khắc phục:* Đã bổ sung cơ chế nội suy (Forward Fill) nhưng tương lai cần mô hình Graph Neural Network (GNN) để suy luận trạng thái từ các tuyến đường lân cận.