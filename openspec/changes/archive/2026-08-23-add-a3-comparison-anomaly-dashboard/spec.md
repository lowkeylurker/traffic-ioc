# Spec: [SE] A3 - API Đa dụng & Dashboard Phát hiện Bất thường

## ADDED Requirements

### Requirement: Unified Comparison API for 8 Metrics

Hệ thống MUST cung cấp endpoint GET /api/v1/analytics/comparison để trả về dữ liệu so sánh baseline và today cho 8 metric theo segment và ngày.

#### Scenario: Valid comparison request

- Given query params hợp lệ: segmentId, metric, date
- When client gọi API comparison
- Then response trả về HTTP 200 với mảng 24 phần tử, mỗi phần tử ứng với 1 giờ từ 0 đến 23
- And field names sử dụng camelCase

#### Scenario: Invalid metric

- Given metric không nằm trong enum 8 giá trị
- When client gọi API
- Then response trả về HTTP 400 và thông điệp validation rõ ràng

#### Scenario: Missing required params

- Given thiếu segmentId hoặc date
- When client gọi API
- Then response trả về HTTP 400 và mô tả tham số thiếu

### Requirement: Hourly Data Contract and Anomaly Computation

Hệ thống MUST merge baseline và today theo khung giờ và tính isAnomaly dựa trên safety band thống kê.

#### Scenario: Standard anomaly computation

- Given baselineAvg và baselineStdDev tồn tại
- When tính safety band
- Then lowerBound = baselineAvg - baselineStdDev
- And upperBound = baselineAvg + baselineStdDev
- And isAnomaly = true nếu todayValue < lowerBound hoặc todayValue > upperBound

#### Scenario: Non-negative metric lower bound clamping

- Given metric thuộc nhóm không âm (ví dụ pcuVolume)
- When lowerBound tính ra giá trị âm
- Then lowerBound MUST được clamp thành 0

#### Scenario: Current hour partial data

- Given giờ hiện tại chưa có dữ liệu đầy đủ
- When API tổng hợp mảng 24 giờ
- Then hệ thống vẫn giữ đủ 24 phần tử theo thứ tự giờ
- And todayValue có thể null tại giờ chưa có dữ liệu

### Requirement: Metric Dictionary and Unit Mapping

Hệ thống MUST sử dụng enum metric thống nhất với map unit và map nhóm dropdown.

#### Scenario: Metric enum validation

- Given metric nằm trong danh sách bên dưới
- When request được xử lý
- Then metric được map đúng vào cột/tính toán backend

Metric enum (8):

1. currentSpeedKmh (km/h)
2. pcuVolume (pcu/h)
3. trafficIndex (ratio)
4. losScore (level)
5. congestionLevel (level)
6. delaySeconds (s)
7. occupancyRate (%)
8. bufferIndex (%)

Metric group strategy (3 nhóm cho dropdown):

- Speed & Flow: currentSpeedKmh, pcuVolume, occupancyRate
- Congestion Quality: trafficIndex, losScore, congestionLevel
- Reliability & Delay: delaySeconds, bufferIndex

### Requirement: Reusable Comparison Chart Behavior

Frontend MUST cung cấp reusable chart component để hiển thị Baseline, Safety Band, Today và anomaly highlight.

#### Scenario: Normal rendering

- Given API trả về dữ liệu hợp lệ
- When chart render
- Then chart hiển thị đường Baseline, vùng Safety Band (Area), và đường Today

#### Scenario: Anomaly highlight

- Given điểm dữ liệu có isAnomaly = true
- When chart render
- Then điểm anomaly MUST được hiển thị màu đỏ để Operator nhận biết ngay

#### Scenario: Dynamic unit on Y axis

- Given người dùng đổi metric sang đơn vị khác
- When chart re-render
- Then nhãn trục Y và tooltip MUST cập nhật unit đúng
- And UI không bị crash

#### Scenario: UI states

- Given request đang tải
- Then hiển thị loading state
- Given API trả về mảng rỗng hoặc toàn null
- Then hiển thị empty state rõ nghĩa
- Given API lỗi
- Then hiển thị error state có khả năng retry

### Requirement: Dashboard Filtering and Polling

Dashboard A3 MUST có 2 dropdown và polling 5 phút để cập nhật dữ liệu.

#### Scenario: Refetch on filter change

- Given người dùng đổi segment hoặc metric
- When state thay đổi
- Then dashboard MUST gọi lại API comparison với query mới

#### Scenario: Stable polling every 5 minutes

- Given dashboard đang mở
- When polling timer đến hạn
- Then dashboard gọi API mỗi 300000ms
- And không tạo request chồng chéo (must cancel/ignore request cũ nếu chưa xong)

### Requirement: Performance Target

Backend MUST đạt mục tiêu response time < 200ms cho endpoint comparison trong điều kiện vận hành bình thường.

#### Scenario: Performance verification

- Given tập dữ liệu production-like và query hợp lệ
- When benchmark API comparison
- Then p95 response time < 200ms
- And truy vấn sử dụng index/partition pruning đúng mục tiêu

## Validation Rules

- date MUST theo format YYYY-MM-DD.
- segmentId MUST là id hợp lệ tồn tại trong dim_segment.
- metric MUST thuộc enum 8 giá trị.
- response MUST đủ 24 phần tử theo thứ tự tăng dần của hour.

## Error Handling

- 400: query params sai/không hợp lệ.
- 404: segment không tồn tại hoặc không có dữ liệu baseline tối thiểu.
- 500: lỗi hệ thống không dự kiến.

## Non-Functional Notes

- Không hardcode secrets; sử dụng env theo convention hiện hữu.
- Ưu tiên SQL-first và map/reduce ở tầng DB/query.
- JSON response camelCase theo rule backend.

## Definition of Done

- Tất cả requirement trên được trace vào tasks và có test case tương ứng.
- API pass validation + benchmark mục tiêu.
- Dashboard đạt hành vi filter/polling/anomaly theo acceptance criteria.

## Open Questions

- Có yêu cầu fallback khi baselineStdDev null/0 cho nhiều giờ liên tiếp không?
- Có cần bổ sung ngưỡng anomaly tính theo weekday/weekend khác nhau không?
