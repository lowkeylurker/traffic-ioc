# Proposal: [SE] A3 - API Đa dụng & Dashboard Phát hiện Bất thường

## Bối cảnh/Vấn đề

A3 yêu cầu Operator so sánh xu hướng hôm nay với baseline lịch sử theo từng segment và metric trong cùng một màn hình. Hiện tại backend chưa có endpoint tổng hợp 24 giờ cho nhiều metric và frontend chưa có chart tái sử dụng để vẽ đường baseline + dải dung sai + anomaly theo một contract thống nhất.

## Mục tiêu

- Cung cấp một API duy nhất để trả về dữ liệu so sánh baseline/today cho 8 metric.
- Chuẩn hóa dữ liệu 24 giờ và tính sẵn anomaly cho mỗi khung giờ.
- Tạo reusable chart hiển thị đầy đủ Baseline, Safety Band, Today và highlight anomaly.
- Lắp ráp dashboard A3 với 2 dropdown (segment, metric) và polling mỗi 5 phút.
- Đảm bảo response time mục tiêu < 200ms trong điều kiện vận hành bình thường.

## Phi mục tiêu

- Không xây dựng mô hình ML anomaly mới trong phạm vi này.
- Không thay đổi kiến trúc auth hoặc role permission hiện hữu.
- Không mở rộng sang workflow cảnh báo push notification realtime.

## In Scope

- SE-A3.1: GET /api/v1/analytics/comparison (segmentId, metric, date).
- SE-A3.1: Merge dữ liệu baseline (materialized view/table baseline) với today từ 0h đến giờ hiện tại.
- SE-A3.1: Tính lowerBound/upperBound và isAnomaly theo quy tắc thống kê.
- SE-A3.2: Reusable chart component (Area + Line + điểm anomaly đỏ + custom tooltip).
- SE-A3.2: Dynamic unit trên trục Y theo metric.
- SE-A3.3: Dashboard A3 với 2 dropdown, refetch theo state, polling 5 phút.

## Out of Scope

- Tự động tạo baseline data mới (chỉ sử dụng nguồn baseline đã có).
- Cài đặt event streaming/WebSocket cho A3.
- Multi-segment compare trên cùng một chart trong phase này.

## Phạm vi theo Sub-ticket

### SE-A3.1 - API gộp Baseline và Real-time

- Tạo endpoint GET /api/v1/analytics/comparison.
- Validate query params và map metric enum vào nguồn dữ liệu tương ứng.
- Trả về mảng JSON 24 phần tử, mỗi phần tử đại diện một giờ (0-23).
- Tính anomaly band:
  - lowerBound = avgValue - stdDev
  - upperBound = avgValue + stdDev
  - metric không âm: lowerBound = max(0, lowerBound)
- Gán cờ isAnomaly = true nếu todayValue nằm ngoài [lowerBound, upperBound].

### SE-A3.2 - Reusable Chart Component

- Xây dựng component tái sử dụng nhận input JSON từ API A3.1.
- Vẽ 3 lớp dữ liệu:
  - Baseline (Line)
  - Safety Band (Area)
  - Today (Line + điểm)
- Highlight điểm anomaly màu đỏ.
- Custom tooltip giải thích baseline/today/lower-upper/unit tại điểm hover.
- Responsive trên desktop/mobile.

### SE-A3.3 - Dashboard Phân tích A3

- Tạo 2 dropdown:
  - Select Segment
  - Select Metric (8 metric, chia 3 nhóm)
- Refetch data khi đổi segment/metric/date.
- Polling 5 phút/lần, tránh duplicate request và tránh giật UI.

## Kiến trúc (Backend/Frontend/Dataflow)

- Data layer: SQL-first tổng hợp baseline + today theo giờ, ưu tiên map/reduce tại DB.
- Backend service: query + merge + normalize + anomaly flag, trả JSON camelCase.
- Frontend: page state quản lý filter + polling; chart component nhận data thuần props.
- UI state flow: loading -> success/empty/error; anomaly state được style rõ ràng.

## API Contract Draft

Endpoint: GET /api/v1/analytics/comparison

Query params:

- segmentId: string | number (required)
- metric: enum (required)
- date: YYYY-MM-DD (required)

Metric enum (8):

- currentSpeedKmh
- pcuVolume
- trafficIndex
- losScore
- congestionLevel
- delaySeconds
- occupancyRate
- bufferIndex

Response (24 items):

- hour: number (0..23)
- baselineAvg: number | null
- baselineStdDev: number | null
- lowerBound: number | null
- upperBound: number | null
- todayValue: number | null
- isAnomaly: boolean
- unit: string
- metric: string

## Chiến lược hiệu năng (< 200ms)

- Sử dụng index theo segment_key + date_key + time_key, tránh full scan partition.
- Tiền xử lý baseline theo giờ trong materialized view/table baseline.
- Query gộp 24 giờ theo một lần gọi, tránh N+1.
- Có thể bổ sung cache ngắn hạn theo key (segmentId, metric, date) nếu cần.

## Rủi ro & Phụ thuộc

- Baseline data availability: cần đảm bảo baseline view/table có dữ liệu cho ngày so sánh.
- Query performance: partition pruning và index hợp lý là bắt buộc để đạt SLA.
- Polling load: cần quản lý cancel request trước và debounce state đổi filter.
- Data consistency: today từ 0h đến now có thể thừa/thiếu điểm ở giờ hiện tại, cần quy tắc fill null rõ ràng.

## Chiến lược rollout

1. Pha 1: chốt data contract và metric dictionary.
2. Pha 2: hoàn tất API và test benchmark latency.
3. Pha 3: ship reusable chart và dashboard filter + polling.
4. Pha 4: UAT với use-case đổi qua lại giữa các segment/metric trong ca cao điểm.

## Acceptance Criteria

- User đổi segment/metric mượt qua dropdown, dữ liệu update đúng.
- Chart hiển thị rõ Baseline, Band, Today.
- Điểm isAnomaly = true được highlight đỏ.
- API trả chuẩn hóa 24 phần tử.
- Trục Y đổi unit đúng theo metric, không crash.
- Polling 5 phút ổn định, không tạo request dư thừa.

## Definition of Done

- Proposal/spec/tasks được validate strict thành công.
- Đã liệt kê rõ In Scope / Out of Scope.
- Đã có kế hoạch test cho 3 sub-ticket A3.1/A3.2/A3.3.
- Đã xác định rủi ro và dependency quan trọng trước implementation.

## Open Questions

- Nguồn baseline chính thức cho A3 sẽ là materialized view nào (tên và tần suất refresh)?
- Quy ước losScore và occupancyRate hiện có trong schema backend được tính trực tiếp hay suy diễn?
- Nhóm metric dropdown (3 nhóm) có cần theo chuẩn nghiệp vụ từ IOC team hay theo kỹ thuật?
