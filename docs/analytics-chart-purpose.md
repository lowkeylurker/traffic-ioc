# Mô tả vai trò từng chart trong AnalyticsPage

Tài liệu này tổng hợp vai trò của từng chart đang được sử dụng trong `frontend/src/pages/AnalyticsPage.tsx` theo 3 câu hỏi:

1. Mục đích của chart này là gì?
2. Tại sao sử dụng chart này cho đại lượng này?
3. Ý nghĩa của nó cho nghiệp vụ dự báo kẹt xe về sau?

## 1) ComparisonChart (chartType: lineBand, groupedBar, scatter)

### Đại lượng liên quan

- currentSpeedKmh (Tốc độ hiện tại)
- pcuVolume (Lưu lượng PCU)
- occupancyRate (Tỷ lệ chiếm dụng)
- trafficIndex
- losScore
- congestionLevel
- delaySeconds
- bufferIndex

### Mục đích

- So sánh giá trị today với baseline theo từng giờ.
- Nhận diện lệch chuẩn, giờ bất thường và xu hướng trong ngày.

### Tại sao dùng chart này

- lineBand: phù hợp để xem chuỗi thời gian + khoảng an toàn (lower/upper bound).
- groupedBar: phù hợp so sánh trực diện baseline vs today theo giờ.
- scatter: phù hợp để nhìn độ phân tán, độ ổn định và các điểm ngoại lệ.

### Ý nghĩa cho dự báo kẹt xe

- Tạo feature lệch theo giờ (today - baseline, z-score theo giờ).
- Xác định "khung giờ bất thường" để tăng trọng số cảnh báo sớm.
- Hỗ trợ learning pattern theo time-of-day cho model dự báo (LSTM/TFT/XGBoost theo lag).

---

## 2) ComparisonDeltaPercentBarChart và ComparisonDeltaBarChart

### Đại lượng liên quan

- Delta tuyệt đối và delta phần trăm của mỗi metric so với baseline.

### Mục đích

- Lượng hóa mức chênh lệch theo giờ theo 2 cách:
  - Tuyệt đối (để biết độ lớn thực tế).
  - Phần trăm (để so sánh công bằng giữa các metric khác đơn vị).

### Tại sao dùng chart này

- Bar chart giúp nhìn nhanh giờ nào tăng/giảm mạnh nhất.
- Dạng percent giúp chuẩn hóa metric, tránh méo do đơn vị đo.

### Ý nghĩa cho dự báo kẹt xe

- Delta là feature cực kỳ quan trọng cho bài toán nowcasting và short-term forecasting.
- Có thể xây dựng trigger rule: nếu delta% vượt ngưỡng liên tiếp N giờ thì nâng cấp cảnh báo.
- Hỗ trợ mô hình phân loại risk level (thấp/trung bình/cao) trước khi kẹt xe xảy ra.

---

## 3) DataQualityDoughnutChart

### Đại lượng liên quan

- Tỷ lệ đầy đủ dữ liệu (todayValue và baselineAvg không null).

### Mục đích

- Đánh giá nhanh chất lượng và độ tin cậy của dữ liệu đầu vào.

### Tại sao dùng chart này

- Doughnut chart phù hợp để biểu diễn cơ cấu thành phần (hợp lệ vs thiếu).
- Dễ đọc ở cấp dashboard KPI tổng quan.

### Ý nghĩa cho dự báo kẹt xe

- Dự báo phụ thuộc mạnh vào chất lượng input; chart này giúp gate model.
- Có thể đặt policy: nếu độ đầy đủ < ngưỡng, mô hình fallback sang baseline/heuristic.
- Giảm rủi ro dự báo sai do missing data.

---

## 4) AnomalyDistributionChart

### Đại lượng liên quan

- Phân bố số giờ bất thường theo 24h.

### Mục đích

- Tìm khung giờ có mật độ bất thường cao.

### Tại sao dùng chart này

- Biểu đồ phân bố theo giờ cho phép nhìn "mẫu hình trong ngày" rất rõ.
- Tốt cho việc so sánh giữa ngày thường/cuối tuần (nếu mở rộng).

### Ý nghĩa cho dự báo kẹt xe

- Tạo prior theo giờ: giờ nào có xác suất kẹt xe cao hơn.
- Hỗ trợ feature engineering theo cyclical time (sin/cos hour) + anomaly density.
- Tăng độ nhạy của cảnh báo sớm tại các khung giờ nhạy cảm.

---

## 5) RollingAverageChart (3h/6h)

### Đại lượng liên quan

- Mỗi metric theo cửa sổ trung bình trượt 3h và 6h.

### Mục đích

- Làm mượt nhiễu, loại bỏ dao động ngắn hạn để thấy trend ổn định.

### Tại sao dùng chart này

- Rolling average là kỹ thuật kinh điển cho chuỗi thời gian giao thông.
- Hiển thị 3h và 6h giúp cân bằng giữa độ nhạy và độ ổn định.

### Ý nghĩa cho dự báo kẹt xe

- Giảm overreaction với spike ngắn hạn.
- Tạo bộ feature trend-level, slope, momentum bên cạnh feature raw.
- Nâng cao độ bền vững của mô hình dự báo trong điều kiện dữ liệu nhiễu.

---

## 6) MiniSparklineChart (trend 7 ngày)

### Đại lượng liên quan

- Giá trị trung bình today theo ngày trong 7 ngày gần nhất.

### Mục đích

- Nhìn nhanh xu hướng ngắn hạn theo ngày (tăng/giảm/ổn định).

### Tại sao dùng chart này

- Sparkline gọn nhẹ, phù hợp KPI card.
- Không cần trục chi tiết, tập trung vào hình dạng xu hướng.

### Ý nghĩa cho dự báo kẹt xe

- Bổ sung bối cảnh "regime" ngắn hạn (giai đoạn đang xấu đi hay cải thiện).
- Hỗ trợ detect concept drift sớm (mẫu hình dữ liệu đổi theo tuần).
- Làm cơ sở điều chỉnh trọng số model hoặc ngưỡng cảnh báo động.

---

## 7) MultiTimeframeComparisonChart (today vs yesterday vs lastWeek)

### Đại lượng liên quan

- Cùng một metric, so sánh đa mốc thời gian theo từng giờ.

### Mục đích

- Đặt hôm nay cạnh hôm qua và tuần trước để thấy dịch chuyển mẫu hình.

### Tại sao dùng chart này

- So sánh đa mốc giúp tách biệt bất thường ngắn hạn và xu hướng theo chu kỳ tuần.
- Trực quan hơn so với xem từng chart riêng lẻ.

### Ý nghĩa cho dự báo kẹt xe

- Cung cấp context temporal rất quan trọng cho dự báo T+15/T+30/T+60.
- Tạo feature relative: today-vs-yesterday, today-vs-lastWeek theo giờ.
- Hỗ trợ mô hình học được tính mùa vụ/ngày trong tuần của giao thông.

---

## 8) CumulativeMetricChart (delay)

### Đại lượng liên quan

- Delay seconds tích lũy trong ngày.

### Mục đích

- Theo dõi "áp lực vận hành" tích lũy theo thời gian, không chỉ điểm cục bộ.

### Tại sao dùng chart này

- Dữ liệu tích lũy phản ánh tổng tác động tới hành trình và hệ thống.
- Cumulative chart nhạy với giai đoạn kẹt xe kéo dài.

### Ý nghĩa cho dự báo kẹt xe

- Trở thành proxy cho mức độ nghiêm trọng của kẹt xe theo ngày.
- Hỗ trợ dự báo "tổng delay cuối ngày" từ dữ liệu đầu ngày.
- Ích lợi cho bài toán quyết định nghiệp vụ: ưu tiên can thiệp corridor nào trước.

---

## 9) Corridor tab - LineChart: speed vs target

### Đại lượng liên quan

- avgCorridorSpeed vs targetAvgSpeed theo giờ.

### Mục đích

- Đo mức độ đạt/chưa đạt mục tiêu vận hành của corridor.

### Tại sao dùng chart này

- 2 đường trên cùng trục thời gian cho thấy khoảng cách hiệu năng rõ ràng.

### Ý nghĩa cho dự báo kẹt xe

- Khoảng cách so với mục tiêu là chỉ báo sớm cho nguy cơ giảm tốc diện rộng.
- Dùng để dự báo khả năng vi phạm SLA tốc độ trong các giờ tiếp theo.

---

## 10) Corridor tab - LineChart: TTI theo giờ

### Đại lượng liên quan

- travelTimeIndex theo giờ.

### Mục đích

- Theo dõi mức độ kéo dài thời gian di chuyển.

### Tại sao dùng chart này

- TTI là đại lượng liên tục theo giờ, line chart để nhìn biến thiên và đỉnh.

### Ý nghĩa cho dự báo kẹt xe

- TTI là biến mục tiêu phổ biến trong bài toán dự báo tắc nghẽn.
- Sử dụng lag TTI, slope TTI, max TTI trong cửa sổ gần để dự báo kẹt xe sắp tới.

---

## 11) Corridor tab - Ranking Bar (Top tổng trễ)

### Đại lượng liên quan

- Tổng delay theo corridor.

### Mục đích

- Xếp hạng điểm nóng để ưu tiên nguồn lực.

### Tại sao dùng chart này

- Bar chart ngang phù hợp ranking nhiều đối tượng có tên dài.

### Ý nghĩa cho dự báo kẹt xe

- Giúp xác định "hot corridors" để tạo mô hình theo nhóm ưu tiên.
- Làm đầu vào cho cơ chế phân bổ tài nguyên dự báo/cảnh báo.

---

## 12) Corridor tab - Heatmap (giờ x corridor, TTI)

### Đại lượng liên quan

- TTI theo 2 chiều: giờ và corridor.

### Mục đích

- Nhìn nhanh điểm nóng theo không gian-thời gian.

### Tại sao dùng chart này

- Heatmap là lựa chọn tối ưu cho ma trận time x entity.
- Màu sắc giúp phát hiện pattern lặp lại và cụm quá tải.

### Ý nghĩa cho dự báo kẹt xe

- Rực rỡ cho bài toán spatio-temporal forecasting.
- Hỗ trợ tạo feature theo ô lưới (corridor-hour cell), neighborhood effect, cluster effect.
- Có thể làm nền cho mô hình graph/time-series lai (GNN + temporal model).

---

## 13) Corridor tab - Bar bottleneck segments

### Đại lượng liên quan

- Tần suất xuất hiện bottleneck theo segment.

### Mục đích

- Tìm segment có tính "thắt cổ chai" lặp lại.

### Tại sao dùng chart này

- Bar chart để so sánh tần suất rõ ràng giữa các segment.

### Ý nghĩa cho dự báo kẹt xe

- Segment tần suất cao là feature quan trọng của rủi ro kẹt xe theo corridor.
- Hỗ trợ mô hình hóa lan truyền kẹt xe từ segment trọng điểm ra toàn hành lang.

---

## 14) Thẻ cảnh báo ngưỡng (Tag + baseline deltas)

### Đại lượng liên quan

- isBelowTargetSpeed, isHighTti, isHighIncidentCount
- speedDeltaPct, delayDeltaPct vs baseline

### Mục đích

- Chuyển hóa metric thành tín hiệu cảnh báo nghiệp vụ để ra quyết định nhanh.

### Tại sao dùng kiểu hiển thị này

- Tag màu sắc + text ngắn gọn cực dễ cho điều hành trực ca.
- Delta baseline đi kèm giúp tránh cảnh báo "cảm tính" không có đối chứng.

### Ý nghĩa cho dự báo kẹt xe

- Tạo nhãn (label) bán giám sát cho mô hình cảnh báo sớm.
- Dùng để đánh giá sau dự báo: precision/recall của rule-based so với model-based.
- Hỗ trợ xây dựng hệ thống hybrid: rule gate + ML scoring.

---

## 15) Tổng kết theo mục đích thống kê

- Mô tả hiện trạng theo giờ: ComparisonChart, TTI line, speed vs target.
- Đo chênh lệch và bất thường: Delta bars, AnomalyDistribution, chi tiết anomaly.
- Kiểm soát chất lượng dữ liệu: DataQualityDoughnutChart.
- Nhìn xu hướng và giảm nhiễu: RollingAverage, Sparkline 7 ngày.
- So sánh đa mốc để thấy dịch chuyển pattern: MultiTimeframeComparisonChart.
- Ưu tiên vận hành theo tác động: Cumulative delay, ranking delay, bottleneck bars.
- Góc nhìn không gian-thời gian: Heatmap corridor x hour.

## 16) Giá trị cho nghiệp vụ dự báo kẹt xe trong tương lai

1. Chuẩn hóa bộ feature dự báo

- Feature mức thời điểm: speed, volume, occupancy, TTI, delay.
- Feature tương đối: delta vs baseline, delta vs hôm qua, delta vs tuần trước.
- Feature xu hướng: rolling mean 3h/6h, slope, momentum.
- Feature cấu trúc không gian: hotspot corridor-hour, bottleneck frequency.

2. Nâng cấp cảnh báo sớm

- Kết hợp anomaly + delta + TTI để tạo risk score theo giờ.
- Đặt ngưỡng động theo giờ/ngày trong tuần thay vì ngưỡng tĩnh.

3. Hỗ trợ quyết định điều hành

- Dự báo corridor nào sẽ vượt ngưỡng trước 15-60 phút.
- Ưu tiên can thiệp theo tổng delay dự kiến và độ nghiêm trọng.

4. Kiểm định và cải tiến mô hình

- Theo dõi concept drift bằng trend 7 ngày và so sánh đa mốc.
- Theo dõi chất lượng input để kích hoạt fallback khi dữ liệu kém.

## 17) Đề xuất triển khai tiếp theo

- Xây bộ chỉ số "Congestion Early Risk Score" hợp nhất từ:
  - delta%, anomaly density, TTI slope, speed-target gap.
- Tạo pipeline đánh giá theo horizon T+15/T+30/T+60 cho từng corridor.
- Lưu lại các feature đã tổng hợp theo giờ để phục vụ huấn luyện định kỳ.
