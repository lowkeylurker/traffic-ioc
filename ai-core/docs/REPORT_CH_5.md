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
*(💡 Gợi ý cho Gemini: Hãy giải thích các kỹ thuật này dưới góc độ tối ưu hóa cho mô hình học máy chuỗi thời gian. Nhấn mạnh vào việc biến dữ liệu thô từ cảm biến thành các vector đặc trưng có ý nghĩa vật lý.)*

-   **5.2.1. Cấu trúc Cửa sổ trượt (Sliding Window & Continuity):** 
    *   *Thông số:* Window size = 12 (tương đương 3 giờ lịch sử với chu kỳ 15 phút/step).
    *   *Lý thuyết:* Tại sao là 3 giờ? Đây là khoảng thời gian đủ để bắt được sự chuyển dịch của các "làn sóng" giao thông (ví dụ: từ lúc bắt đầu ùn ứ đến khi vỡ trận).
    *   *Kỹ thuật Continuity Check:* Giải thích thuật toán lọc cửa sổ liên tục (find_valid_window_starts) để đảm bảo không có dữ liệu rác hoặc dữ liệu bị đứt đoạn do mất tín hiệu cảm biến.
    *   *📷 Hình ảnh gợi ý:* Chèn minh họa cơ chế Sliding Window di chuyển trên trục thời gian, làm nổi bật việc trích xuất `input_sequence` và `target_label`.

-   **5.2.2. Nhúng bối cảnh không gian (Spatial & Categorical Embedding):** 
    *   *Thông số:* Embedding Dimension = 8.
    *   *Tại sao chọn Embedding?* So sánh với One-hot Encoding. Giải thích hiện tượng "bùng nổ chiều" (Curse of Dimensionality) khi có hàng trăm Segment ID.
    *   *Tác dụng:* Embedding giúp mô hình tự học được "khoảng cách giao thông" giữa các đoạn đường. Ví dụ: Hai đoạn đường ở gần nhau hoặc có cùng đặc điểm hình học sẽ có vector nhúng gần nhau trong không gian vector.

-   **5.2.3. Mã hóa tính chu kỳ (Cyclical Temporal Encoding):** 
    *   *Kỹ thuật:* Sử dụng hàm Sine và Cosine để mã hóa đặc trưng thời gian (Giờ, Phút).
    *   *Lý do:* Giúp mô hình hiểu được tính liên tục của thời gian (ví dụ: 23:59 và 00:01 là rất gần nhau, điều mà mã hóa tuyến tính 0-23 không làm được).
    *   *📷 Hình ảnh gợi ý:* Chèn biểu đồ hình tròn minh họa việc biến trục thời gian 24h thành một vòng lặp liên tục bằng Sin/Cos.

-   **5.2.4. Chuẩn hóa và Tiền xử lý (Scaling & Imputation):**
    *(💡 Gợi ý cho Gemini: Hãy viết phần này làm nổi bật tính chuyên nghiệp trong quy trình MLOps. Giải thích chi tiết các khái niệm: Forward Fill, Loss Landscape, Data Leakage và Preprocessing Artifacts.)*
    *   **a. Xử lý khuyết thiếu cục bộ (Local Imputation):** 
        - Giải thích việc dùng `ffill` (Forward Fill) cho các lỗ hổng nhỏ dựa trên tính quán tính vật lý của dòng xe. 
        - Phân biệt với việc loại bỏ cửa sổ lớn (Mục 5.2.1).
    *   **b. Cơ sở toán học của Feature Scaling:** 
        - Phân tích sự chênh lệch Magnitude giữa Speed (0-80) và Delay (>3000). 
        - Giải thích hiện tượng "mù" nơ-ron và cách `StandardScaler` giúp biến bề mặt hàm mất mát (Loss Landscape) từ khe núi hẹp thành hình lòng chảo đẳng hướng (isotropic).
    *   **c. Chống rò rỉ dữ liệu (Preventing Data Leakage):** 
        - Trình bày quy trình: `fit()` trên Training set -> "Đóng băng" thông số -> `transform()` trên Val/Test. 
        - Giải thích tại sao đây là bước sống còn để tránh kết quả "ảo tưởng".
    *   **d. Đóng gói Bản hợp đồng Dữ liệu (Preprocessing Artifacts):** 
        - Giải thích vai trò của tệp `preprocessing_artifacts.pkl`. 
        - Đảm bảo tính nhất quán (Consistency) tuyệt đối giữa môi trường Huấn luyện và API Inference thực tế.
    *   *📷 Hình ảnh gợi ý:* 
        1. **Loss Landscape Comparison:** (Tôi đã vẽ cho bạn file `loss_landscape_scaling.png`).
        2. **MLOps Pipeline Diagram:** Sơ đồ luồng dữ liệu đi qua Scaler từ Training đến Deployment.


-   **5.2.5. Quy trình Đánh giá và Tuyển chọn Đặc trưng (Feature Quality Assessment):**
    *   *Bước 1 - Phân tích Đa cộng tuyến (Multicollinearity):* Sử dụng ma trận tương quan để loại bỏ các cặp đặc trưng có độ tương quan > 0.7. Việc này giúp giảm nhiễu và tăng tính ổn định cho mô hình (Giải quyết hiện tượng "redundant features").
    *   *Bước 2 - Xếp hạng tầm quan trọng (Feature Importance):* Sử dụng thuật toán Random Forest kết hợp Stratified K-Fold để tính toán chỉ số Gini Importance cho từng đặc trưng. Chỉ những đặc trưng có điểm số cao (tác động mạnh đến việc phân lớp kẹt xe) mới được giữ lại cho pipeline huấn luyện chính thức.
    *   *📷 Hình ảnh gợi ý:* 
        1. **Heatmap Correlation:** Minh họa ma trận tương quan giữa các biến, đánh dấu các vùng bị loại bỏ do đa cộng tuyến.
        2. **Feature Importance Bar Chart:** Biểu đồ cột xếp hạng các đặc trưng từ cao xuống thấp (ví dụ: `traffic_index` và `is_peak_hour` thường đứng đầu).



**5.3. Chiến lược Cân bằng Dữ liệu (Resampling Comparative Analysis)**

-   **5.3.1. Thách thức từ dữ liệu mất cân bằng cực hạn (Extreme Imbalance):** 
    *   *Bối cảnh:* Trong giao thông thực tế, trạng thái thông thoáng (Lớp 0, 1) chiếm hơn 90% dữ liệu, trong khi trạng thái "Vỡ trận" (Lớp 5) chỉ chiếm chưa đầy 0.1%. 
    *   *Vấn đề:* Nếu huấn luyện trực tiếp, mô hình sẽ bị bẫy "Majority Class Bias" (luôn dự báo không kẹt để đạt độ chính xác cao), dẫn đến việc Agent DQN phản ứng chậm trễ khi kẹt xe thực sự bắt đầu.
    *   *📷 Hình ảnh gợi ý:* [Hình 5.r: So sánh phân phối trước/sau Resampling] (Tham chiếu file `resampling_comparison.png`).

-   **5.3.2. Tại sao không sử dụng SMOTE/ADASYN?**
    *   *Lý do kỹ thuật:* SMOTE tạo mẫu ảo bằng nội suy tuyến tính (Linear Interpolation). Trong không gian trạng thái giao thông, các biến (Tốc độ, Mật độ) có ràng buộc phi tuyến nghiêm ngặt. Việc nội suy mù quáng sẽ tạo ra các "trạng thái ảo giác phi vật lý" (ví dụ: mật độ xe kẹt cứng nhưng tốc độ vẫn đạt 60km/h), làm hỏng khả năng học của Agent.

-   **5.3.3. Chiến lược Hybrid Resampling (Anchor-based & Sequence-CTGAN):**
    *   *Nhánh 1 - Smart Under-sampling (Lớp đa số):* Áp dụng cơ chế "Anchor-based Filtering". Sử dụng Lớp 3 (Kẹt xe trung bình) làm mỏ neo (Anchor) với khoảng 51,000 cửa sổ. Hệ thống tự động lọc bớt các lớp 0, 1, 2 xuống mức ~80k-100k cửa sổ để giảm nhiễu nhưng vẫn giữ được đặc tính phân phối thực.
    *   *Nhánh 2 - Sequence-CTGAN Over-sampling (Lớp thiểu số):* Sử dụng mạng GAN dạng bảng (Conditional Tabular GAN) để sinh thêm 30,000 cửa sổ cho Lớp 4 và 22,000 cửa sổ cho Lớp 5. 
    *   *Điểm đặc biệt:* CTGAN được cấu hình để sinh dữ liệu theo dạng **Cửa sổ (Windows)** 13 bước thời gian thay vì sinh dòng lẻ, nhằm đảm bảo tính nhất quán của chuỗi thời gian (Temporal Consistency).

-   **5.3.4. Màng lọc Hậu kiểm Vật lý (Physical Sanity Check):**
    *   Dữ liệu sau khi sinh bởi GAN phải đi qua "Màng lọc lọc vật lý" (Sanity Filter) để đảm bảo độ tin cậy tuyệt đối:
        1. **Ràng buộc Tốc độ - Mật độ:** Kiểm tra tỷ lệ nghịch giữa `traffic_index` và `current_speed_kmh`. Các mẫu có chỉ số kẹt xe cao mà tốc độ cao sẽ bị loại bỏ ngay lập tức.
        2. **Tính mượt mà thời gian (Temporal Smoothness):** Loại bỏ các chuỗi có sự thay đổi tốc độ đột biến vượt quá ngưỡng vật lý cho phép trong 15 phút (chống hiện tượng Sudden Jump nhiễu từ GAN).

**5.4. Trạm tiền huấn luyện Giám sát (Supervised Baseline Justification)**

-   **5.4.1. Xây dựng "Trực giác" ban đầu cho Agent thông qua Học có giám sát (Supervised Pre-training):**
    *   *Triết lý:* Thay vì để Agent DQN bắt đầu từ sự ngẫu nhiên hoàn toàn (khởi động lạnh), đồ án thiết lập một pha tiền huấn luyện dưới dạng bài toán phân lớp (Classification).
    *   *Kiến trúc mô hình:* Sử dụng mạng Neural Network sâu (DNN) được thiết kế đồng nhất với mạng Q-Network của Agent. Huấn luyện trên tập dữ liệu đã cân bằng (Balanced Data) từ bước 5.3.
    *   *Kỹ thuật đặc biệt:* Sử dụng **Focal Loss** để ép mô hình tập trung vào các nhãn kẹt xe nặng (Lớp 4, 5) và bộ trọng số phạt nhãn (Class Weights) tỉ lệ nghịch với tần suất xuất hiện. Hiệu suất đạt đỉnh ở chỉ số **Macro-F1 ~ 0.70**.

-   **5.4.2. Giải pháp khắc phục vấn đề "Khởi động lạnh" (Cold Start) trong RL:**
    *   *Thách thức:* Trong Reinforcement Learning, nếu Agent không có tri thức bối cảnh, nó sẽ thực hiện hàng ngàn hành động phi vật lý (ví dụ: dự báo kẹt xe khi tốc độ đang 80km/h) gây lãng phí tài nguyên và khó hội tụ.
    *   *Cơ chế "Tiêm tri thức":* Đồ án đóng gói toàn bộ tri thức của mô hình Supervised (Scaler, Encoders, Trọng số mạng) thành các **Artifacts** (`best_traffic_model_baseline.pt`).

-   **5.4.3. Chuyển giao trọng số (Warm-start Weight Injection):**
    *   *Thực thi:* Khi bắt đầu pha Reinforcement Learning, Agent DQN không khởi tạo trọng số ngẫu nhiên mà thực hiện **Load State Dict** từ mô hình Supervised đã huấn luyện.
    *   *Lợi ích thực chứng:* Việc "Warm-start" giúp Agent bỏ qua giai đoạn mò mẫm vô định, ngay lập tức có khả năng nhận diện các trạng thái giao thông cơ bản và chỉ tập trung vào việc tối ưu hóa chiến lược hành động để nhận phần thưởng cao nhất (Reward).
    *   *📷 Hình ảnh gợi ý:* [Hình 5.w: Quy trình chuyển giao tri thức từ Supervised sang RL] (Tham chiếu file `warmstart_process.png`).

**5.5. Kiến trúc Đặc vụ Học tăng cường (Double DQN Architecture)**

-   **5.5.1. Lựa chọn thuật toán Double DQN (DDQN):**
    *   *Lý do lựa chọn:* Bài toán dự báo có không gian hành động rời rạc (6 lớp kẹt xe). DDQN được chọn để giải quyết hội chứng **Overestimation Bias** (Ảo tưởng giá trị Q) của DQN truyền thống bằng cách tách biệt mạng Chính (**Policy Network**) để chọn hành động và mạng Đích (**Target Network**) để đánh giá hành động.
    *   *📷 Hình ảnh gợi ý:* [Hình 5.d: Kiến trúc Double DQN - Cơ chế tách biệt mạng Chính và mạng Đích] (Tham chiếu file `ddqn_architecture.png`).

-   **5.5.2. Cấu trúc mạng Q-Network và Siêu tham số Huấn luyện:**
    *   *Kiến trúc:* Kế thừa DNN từ mô hình Baseline, sử dụng các nhánh đầu vào đa phương thức (Dynamic, Static, Categorical).
    *   *Loss Function đặc biệt:* Sử dụng **Huber Loss (Smooth L1 Loss)**. Giải thích: Khác với MSE (bị nhiễu bởi các giá trị cực đoan), Huber Loss hoạt động ổn định hơn với dữ liệu cảm biến giao thông vốn có nhiều biến động bất thường.
    *   *Siêu tham số chủ chốt:* Hệ số chiết khấu $\gamma = 0.99$ (tầm nhìn dài hạn), Replay Buffer 100,000 mẫu, Batch size 64.

-   **5.5.3. Thiết kế Hàm Phần thưởng (Reward Shaping) - "Linh hồn" của sự thông minh:**
    *   *Triết lý:* Thiết kế hàm thưởng không đối xứng (**Asymmetric Penalty**) để định hướng hành vi an toàn.
    *   *Cơ chế Thưởng/Phạt:*
        1. **Thưởng chuẩn xác (Match Bonus):** +10 điểm (nhân trọng số lớp) khi dự báo đúng hoàn toàn.
        2. **Phạt sai lệch gần (Near Miss):** -2 điểm khi lệch 1 cấp (vẫn chấp nhận được trong dự báo giao thông).
        3. **Phạt sai lệch xa (Far Miss):** Phạt theo hàm tuyến tính khoảng cách lỗi.
        4. **PHẠT CỰC NẶNG (Severe Mismatch):** Phạt gấp 4-5 lần (lên đến -20 điểm) nếu Agent dự báo "Thông thoáng" trong khi thực tế là "Thảm họa (Lớp 5)".
    *   *Kết quả mong muốn:* Agent học được "trực giác an toàn", thà dự báo nhầm kẹt xe còn hơn bỏ sót thảm họa, giúp hệ thống hoạt động tin cậy trong môi trường thực tế.

**5.6. Đánh giá Thực nghiệm và So sánh (Empirical Evaluation & Benchmarking)**

-   **5.6.1. Thiết lập các mô hình đối chứng (Baselines):**
    *   **Mô hình 1 - LSTM chuẩn (Vanilla LSTM):** Huấn luyện trên dữ liệu thô bị mất cân bằng trầm trọng. Đây là đại diện cho cách tiếp cận truyền thống.
    *   **Mô hình 2 - Supervised Baseline (XGBoost/DNN):** Mô hình dùng để tạo tri thức nền tảng (đã trình bày ở mục 5.4).
    *   **Mô hình đề xuất (Hybrid Double DQN):** Kết hợp toàn bộ chuỗi xử lý: Hybrid Resampling -> Warm-start -> Double DQN -> Asymmetric Reward Shaping.

-   **5.6.2. Phân tích Chỉ số Hiệu năng (Metrics Analysis):**
    *   *Tại sao không dùng Accuracy?* Trong dữ liệu giao thông, 90% là thông thoáng. Nếu mô hình luôn đoán "Thông thoáng", Accuracy vẫn đạt 90% nhưng hệ thống vô dụng vì bỏ lọt 10% kẹt xe thảm họa.
    *   *Trọng tâm:* So sánh **Recall (Độ phủ)** của Lớp 4 và Lớp 5. Chứng minh mô hình Hybrid có Recall cao hơn hẳn (vọt lên mức > 80%) so với LSTM chuẩn (thường < 10% hoặc bằng 0). 
    *   *Cách dẫn chứng (Dành cho Gemini):* Hãy lập bảng so sánh số liệu giữa 3 mô hình. Trích dẫn rằng số liệu được lấy trực tiếp từ tệp JSON đánh giá trong thư mục `artifacts/rl/metrics/` của dự án để đảm bảo tính thực chứng và khả năng tái lập (Reproducibility).
    *   *📷 Hình ảnh gợi ý:* [Hình 5.e: So sánh chỉ số Độ phủ (Recall) thực tế giữa các mô hình] (Tham chiếu file `real_recall_comparison_chart.png`).

-   **5.6.3. Giải thích tính minh bạch (XAI - SHAP):**
    *   *Vấn đề "Hộp đen":* Các mô hình Deep Learning thường khó giải thích tại sao lại đưa ra dự báo kẹt xe.
    *   *Giải pháp SHAP (SHapley Additive exPlanations):* Sử dụng SHAP để bóc tách tầm ảnh hưởng của từng đặc trưng. 
    *   *Minh chứng:* Chứng minh mô hình dự báo "Thảm họa" là do các biến số như `avg_speed` giảm sâu và `traffic_index` tăng đột biến, chứ không phải do "học vẹt" các quy luật ngẫu nhiên. Điều này đảm bảo tính tin cậy khi triển khai thực tế.

**5.7. Hạn chế của Hệ thống đề xuất và Hướng phát triển**

-   **Hạn chế 1 (Độ trễ hệ thống - Inference Latency):** Hiện tại pipeline xử lý qua nhiều bước trung gian (Scaler -> LSTM -> DQN) trên nền tảng Python, có thể tạo ra độ trễ nhỏ khi xử lý quy mô hàng vạn segment cùng lúc. 
    *   *Hướng khắc phục:* Chuyển đổi mô hình sang định dạng **TensorRT** hoặc **ONNX Runtime** để tăng tốc độ suy luận trên GPU, đáp ứng thời gian thực khắt khe hơn.

-   **Hạn chế 2 (Khoảng cách giữa dữ liệu Nhân tạo và Thực tế - Sim-to-Real Gap):** Mặc dù CTGAN đã hỗ trợ cân bằng dữ liệu rất tốt, nhưng dữ liệu nhân tạo vẫn có độ "sạch" nhất định, chưa mô phỏng được hoàn toàn các nhiễu loạn cực đoan (như lỗi cảm biến nhảy vọt) trong thực tế.
    *   *Hướng khắc phục:* Áp dụng kỹ thuật **Online Reinforcement Learning**, cho phép Agent tiếp tục tinh chỉnh hành vi trực tiếp từ phản hồi của dòng xe thực tế sau khi triển khai.

-   **Hạn chế 3 (Sự phụ thuộc vào cấu trúc hạ tầng):** Mô hình hiện tại mạnh về dự báo theo chuỗi thời gian của từng segment riêng lẻ, nhưng chưa khai thác sâu mối quan hệ không gian phức tạp (ví dụ: kẹt xe ở ngã tư này chắc chắn sẽ ảnh hưởng đến đường kia sau 5 phút).
    *   *Tiến độ hiện tại:* Đã thực hiện bước đệm bằng cơ chế **Global Spatial Fallback** (sử dụng đặc trưng của các đoạn đường lân cận để dự báo khi một đoạn đường bị mất tín hiệu). 
    *   *Hướng phát triển:* Tích hợp kiến trúc **Graph Neural Network (GNN)** để biến mạng lưới giao thông thành một đồ thị động, nâng cao độ chính xác của các lan truyền ùn tắc không gian.