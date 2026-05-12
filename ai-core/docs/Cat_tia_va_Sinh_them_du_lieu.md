### Giai đoạn 1: Cắt tỉa Thông minh (Undersampling Mức 0, 1, 2)

**Mục tiêu:** Giảm thiểu sự dư thừa, tiết kiệm tài nguyên GPU, nhưng không làm mất đi các khoảnh khắc giao thông chuyển tiếp quan trọng. Tránh việc tạo ra đỉnh chóp mới ở Mức 2.

**1\. Khởi tạo mỏ neo (Anchor):**

-   Lấy $M = \text{count}[3] = 90,286$ làm mỏ neo.

-   Đặt trần (cap) mục tiêu đồng đều cho cả 3 Mức 0, 1, 2 là $2.5M$ (Khoảng **225,000 dòng/mức**). Việc này giúp Agent không bị thiên kiến (bias) vào bất kỳ lớp đa số nào.

**2\. Tính toán Xác suất cơ sở (Base Probability):**

-   $P_{base\_0} = 2.5M / 1,700,960 \approx 0.13$ (13%)

-   $P_{base\_1} = 2.5M / 1,632,920 \approx 0.138$ (13.8%)

-   $P_{base\_2} = 2.5M / 704,701 \approx 0.32$ (32%)

**3\. Áp dụng Thuật toán Hiệu chỉnh (Có vá lỗi):**

Quét qua từng dòng dữ liệu và tính xác suất giữ lại cuối cùng:

-   Nếu là **Cửa sổ chuyển tiếp (Transition):** $P_{final} = \min(1.0, P_{base} \times 1.30)$

-   Nếu là **Cửa sổ trùng lặp (Duplicate):** $P_{final} = \min(1.0, P_{base} \times 0.20)$

    -   *Lưu ý kỹ thuật:* Định nghĩa "trùng lặp" bằng cách tính Sai số tuyệt đối (MAE) giữa các giá trị Float, thay vì dùng toán tử `==`.

-   Khác: $P_{final} = P_{base}$

-   Thực thi giữ lại dòng dữ liệu bằng lệnh: `if np.random.rand() < P_final:`

### Giai đoạn 2: Giữ nguyên Điểm Neo (Mức 3)

**Mục tiêu:** Bảo toàn 100% dữ liệu gốc có giá trị cao.

-   Giữ nguyên toàn bộ **90,286 dòng** của Mức 3. KHÔNG áp dụng cắt tỉa, KHÔNG dùng AI sinh thêm. Đây là lõi dữ liệu thực tế đáng tin cậy nhất cho các tình huống ùn tắc chớm nở.

### Giai đoạn 3: Bơm dữ liệu bằng AI Tạo sinh (Oversampling Mức 4, 5)

**Mục tiêu:** Cung cấp đủ "kinh nghiệm thảm họa" cho Agent để thiết lập các hàm Reward trừng phạt chính xác mà không bị sụp đổ trạng thái (Mode Collapse).

**1\. Tiền xử lý Không gian dữ liệu:**

-   Lọc riêng các dòng Mức 4 và 5.

-   Trải phẳng (Flatten) ma trận chuỗi thời gian `dynamic` từ shape (12, 5) thành 60 cột 1D (ví dụ: `speed_t0`, `volume_t0`, ... `speed_t11`). Gộp cùng các cột `static` và `categorical`.

**2\. Chiến thuật cho Mức 5 (Cấp cứu thiểu số cực đoan):**

-   **Bước A (Cơ học):** Từ 437 dòng gốc, áp dụng Data Augmentation cơ bản (thêm nhiễu Gaussian ngẫu nhiên $\pm 2\%$ vào các biến liên tục) để nhân bản lên khoảng **2,000 dòng**.

-   **Bước B (AI Tạo sinh):** Đưa 2,000 dòng này vào mô hình `CTGANSynthesizer` (thư viện SDV). Huấn luyện và yêu cầu sinh ra thêm **20,000 dòng** mới.

**3\. Chiến thuật cho Mức 4 (Sinh tạo trực tiếp):**

-   Đưa thẳng 5,276 dòng gốc vào một mô hình CTGAN khác (chuyên trị Mức 4).

-   Huấn luyện và sinh ra **50,000 dòng**.

**4\. Hậu kiểm Vật lý (Sanity Check) & Tái cấu trúc:**

-   Chạy toàn bộ 70,000 dòng giả (Mức 4 + 5) qua hàm `physics_sanity_check()`. Cắt bỏ ngay lập tức những dòng có $speed < 0$, $volume < 0$, hoặc các tương quan vật lý vô lý (ví dụ: mật độ xe $= 0$ nhưng vẫn gán nhãn kẹt cứng).

-   Cuộn ngược (Reshape) 60 cột `dynamic` trở lại hình dáng tensor (12, 5).

### Giai đoạn 4: Hợp nhất và Chuẩn bị (Final Merge)

**Mục tiêu:** Tạo ra một DataLoader hoàn hảo cho vòng lặp huấn luyện RL.

1.  Nối (Concatenate) dữ liệu từ cả 3 Giai đoạn trên thành một DataFrame khổng lồ.

2.  Xáo trộn ngẫu nhiên (Shuffle) toàn bộ bộ dữ liệu để phá vỡ tính tuần tự theo cụm lớp.

3.  Xuất ra định dạng `.parquet` để sẵn sàng cho hàm `__init__` của Môi trường (Environment) nạp lên RAM siêu tốc.