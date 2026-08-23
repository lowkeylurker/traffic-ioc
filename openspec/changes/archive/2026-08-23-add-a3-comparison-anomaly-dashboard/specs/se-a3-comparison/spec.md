## ADDED Requirements

### Requirement: Cung cap API comparison thong nhat cho 8 metric

Hệ thống MUST cung cấp endpoint GET /api/v1/analytics/comparison để trả về dữ liệu baseline và today cho một segment, một metric, một ngày.

#### Scenario: Tra ve 24 diem theo gio

- **GIVEN** segmentId, metric, date hợp lệ
- **WHEN** client gọi API
- **THEN** hệ thống trả về HTTP 200
- **AND** response là mảng 24 phần tử từ hour 0 đến 23
- **AND** các field trong response dùng camelCase

#### Scenario: Metric khong hop le

- **GIVEN** metric không thuộc enum 8 giá trị
- **WHEN** client gọi API
- **THEN** hệ thống trả HTTP 400 với thông điệp validation rõ ràng

### Requirement: Tinh anomaly band va isAnomaly theo quy tac thong ke

Hệ thống MUST tính dải dung sai an toàn theo avg +- stdDev và đánh dấu bất thường cho từng giờ.

#### Scenario: Tinh anomaly thong thuong

- **GIVEN** baselineAvg và baselineStdDev tồn tại
- **WHEN** hệ thống tính band
- **THEN** lowerBound = baselineAvg - baselineStdDev
- **AND** upperBound = baselineAvg + baselineStdDev
- **AND** isAnomaly = true nếu todayValue nằm ngoài [lowerBound, upperBound]

#### Scenario: Clamp can duoi cho metric khong am

- **GIVEN** metric thuộc nhóm không âm và lowerBound < 0
- **WHEN** hệ thống tính band
- **THEN** lowerBound phải được clamp về 0

### Requirement: Reusable chart phai hien thi du 3 thanh phan va anomaly do

Frontend MUST có component tái sử dụng để hiển thị Baseline, Safety Band, Today và anomaly highlight.

#### Scenario: Render chart day du

- **GIVEN** data hợp lệ từ API comparison
- **WHEN** chart được render
- **THEN** có đường Baseline
- **AND** có vùng Safety Band dạng Area
- **AND** có đường Today

#### Scenario: Highlight diem anomaly

- **GIVEN** điểm có isAnomaly = true
- **WHEN** chart render
- **THEN** điểm anomaly hiển thị màu đỏ rõ ràng

#### Scenario: Don vi truc Y dong

- **GIVEN** user đổi metric
- **WHEN** chart cập nhật props
- **THEN** trục Y và tooltip cập nhật đúng unit
- **AND** UI không bị crash

### Requirement: Dashboard A3 phai ho tro filter va polling on dinh

Dashboard MUST cho phép đổi segment/metric và cập nhật dữ liệu định kỳ 5 phút.

#### Scenario: Refetch theo dropdown

- **GIVEN** user thay đổi segment hoặc metric
- **WHEN** state filter thay đổi
- **THEN** dashboard gọi lại API với query mới

#### Scenario: Polling 5 phut

- **GIVEN** dashboard đang active
- **WHEN** đến chu kỳ 300000ms
- **THEN** dashboard gọi API cập nhật dữ liệu
- **AND** không tạo request chồng chéo/dư thừa

### Requirement: API comparison dat muc tieu hieu nang

Hệ thống MUST đạt p95 response time < 200ms cho endpoint comparison trong điều kiện vận hành bình thường.

#### Scenario: Kiem thu benchmark

- **GIVEN** tập dữ liệu gần production
- **WHEN** chạy benchmark API comparison
- **THEN** p95 response time nhỏ hơn 200ms
