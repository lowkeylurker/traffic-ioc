### Kỹ thuật kiểm chứng

### Bước 1: Khởi nguồn từ Kiến thức ngành (Phần "Nghệ thuật")

Đúng như bạn nhận định, ý tưởng đầu tiên luôn bắt nguồn từ trực giác và sự am hiểu thực tế của người kỹ sư.

-   Thuật toán là một cỗ máy vô tri. Nó nhìn vào cột Lượng mưa = 50mm và cột Triều cường = 1.5m như những con số độc lập.

-   Nhưng bạn (Kỹ sư sống ở TP.HCM) có kiến thức ngành. Bạn biết rằng Mưa lớn + Triều cường cao = Ngập lụt úng = Kẹt xe Mức 5.

-   Từ trực giác đó, bạn viết code tạo ra một đặc trưng mới: Chi_so_ngap_lut = Luong_mua * Trieu_cuong.

### Bước 2: Kiểm chứng bằng Kỹ thuật Phân tích (Phần "Khoa học")

Trực giác của con người đôi khi rất hay sai. Sau khi bạn tạo ra đặc trưng Chi_so_ngap_lut, bạn TUYỆT ĐỐI KHÔNG được nhét ngay nó vào mô hình. Bạn phải dùng các kỹ thuật phân tích thống kê để "thử lửa" xem nó có thực sự giá trị không. Đây là lúc các kỹ thuật chuyên nghiệp vào cuộc:

1\. Ma trận Tương quan (Correlation Analysis):

Bạn chạy hệ số Pearson hoặc Spearman để đo sự tương quan giữa cột đặc trưng mới và cột Label (Mức kẹt xe).

-   Nếu hệ số $\approx 0$: Đặc trưng này là rác, trực giác của bạn đã sai, phải vứt đi để không làm nặng mô hình.

-   Nếu hệ số $> 0.6$ hoặc $< -0.6$: Chúc mừng! Bạn vừa tìm ra một "mỏ vàng" dữ liệu.

2\. Đo lường Tầm quan trọng (Feature Importance):

Bạn ném tập dữ liệu vào một mô hình Dạng cây (như XGBoost hoặc Random Forest). Các mô hình này có khả năng chấm điểm xem đặc trưng nào đóng góp nhiều nhất vào việc giảm tỷ lệ lỗi (Gini Impurity). Nếu đặc trưng mới của bạn nằm lẹt đẹt ở đáy bảng xếp hạng, bạn loại bỏ nó (Kỹ thuật này gọi là Feature Selection).

3\. Phân tích Phân phối (EDA - Exploratory Data Analysis):

Bạn vẽ biểu đồ Histogram hoặc Boxplot. Bạn kiểm tra xem: "Liệu ở những ca kẹt xe Mức 5, cái Chi_so_ngap_lut này có phân bố khác biệt hoàn toàn so với ca Mức 0 không?". Nếu biểu đồ của 2 mức chồng chéo lên nhau y hệt, đặc trưng đó vô dụng.

4\. Phân tích SHAP (SHapley Additive exPlanations):

Đây là kỹ thuật đỉnh cao nhất hiện nay. Nó dùng Lý thuyết Trò chơi (Game Theory) để giải thích xem đặc trưng mới tạo ra đã đẩy dự báo của Agent lên cao hay kéo xuống thấp trong từng khoảnh khắc giao thông cụ thể.

Chiến thuật thiết kế

Dưới đây là cách bạn nên triển khai cái phễu này cho dự án dự báo giao thông của mình:

### Tầng 1: Lọc Nhanh (Sử dụng cho 100% ý tưởng mới)

-   Kỹ thuật: Phân tích Phân phối (EDA) & Ma trận tương quan (Correlation).

-   Chi phí tính toán: Cực kỳ rẻ (Vài giây chạy code Pandas/Matplotlib).

-   Cách dùng: Bất cứ khi nào bạn nghĩ ra một đặc trưng mới (ví dụ: Độ ẩm không khí), hãy vẽ ngay Boxplot chia theo 6 mức kẹt xe. Nếu dải phân bố của Mức 0 và Mức 5 y hệt nhau, đặc trưng này là rác $\rightarrow$ Vứt bỏ ngay lập tức ở Tầng 1.

-   Lưu ý riêng cho bài toán của bạn: Vì Mức 5 của bạn rất hiếm (Imbalanced Data), hệ số tương quan tuyến tính (Pearson) có thể bị nhiễu và lừa bạn. Nên ở tầng này, hãy tin vào mắt mình qua biểu đồ EDA hơn là tin vào con số Correlation.

### Tầng 2: Sàng lọc Đội hình (Sử dụng khi có một nhóm đặc trưng lọt qua Tầng 1)

-   Kỹ thuật: Tầm quan trọng Đặc trưng (Feature Importance bằng XGBoost/Random Forest).

-   Chi phí tính toán: Trung bình (Vài phút huấn luyện).

-   Cách dùng: Giả sử bạn có 30 đặc trưng đã vượt qua Tầng 1 (đều có ý nghĩa độc lập). Nhưng khi nhét cả 30 cái vào một mô hình, có thể chúng sẽ "giẫm chân lên nhau" (Đa cộng tuyến - Multicollinearity).

-   Ví dụ: Đặc trưng Tốc độ trung bình và Thời gian di chuyển mang cùng một lượng thông tin. Cây quyết định sẽ chỉ định cao điểm cho 1 cái và hạ điểm cái kia xuống sát 0. Nhờ đó, bạn mạnh tay loại bỏ các đặc trưng thừa thãi, chốt lại đội hình Top 15 tinh túy nhất để đưa vào mạng Double DQN.

### Tầng 3: Khám nghiệm & Giải trình (Chỉ dùng khi xảy ra sự cố)

-   Kỹ thuật: SHAP (SHapley Additive exPlanations).

-   Chi phí tính toán: Cực kỳ đắt đỏ và nặng nề.

-   Cách dùng: Bạn KHÔNG dùng SHAP để chọn đặc trưng hàng ngày. Bạn chỉ rút thanh gươm này ra trong 2 trường hợp:

1.  Bắt bệnh Mô hình: Khi DQN của bạn đang chạy tốt tự nhiên liên tục báo động giả Mức 5. Bạn dùng SHAP cắt lớp quyết định đó ra để xem: "Đặc trưng nào đang bơm điểm láo làm AI bị ảo giác?".

2.  Báo cáo cho Sếp/Khách hàng: Khi Giám đốc Sở GTVT hỏi bạn: "Tại sao mô hình của em lại dự báo ngã tư này kẹt xe vào 3h chiều nay?". Mạng Nơ-ron là hộp đen, bạn không thể giải thích bằng mồm. Bạn in biểu đồ SHAP ra và nói: "Dạ do biến 'Lô cốt thi công' cộng với biến 'Mưa lớn' đã đóng góp 80% vào trọng số dự báo này ạ."