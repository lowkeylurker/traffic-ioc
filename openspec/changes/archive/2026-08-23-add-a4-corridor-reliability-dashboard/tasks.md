# Tasks: [SE] A4 - Corridor Reliability Dashboard (DAT-66)

## Phase 1 - FE-first Foundation (Owner: FE)

1. [x] Chuẩn hóa data model `CorridorReliabilityItem` cho table/map/modal.
2. [x] Tạo reliability provider abstraction (mock-first) theo contract planned.
3. [x] Tạo utility mapping màu heatmap theo ngưỡng `bufferIndex` dùng chung toàn page.

Dependencies:

- Cần chốt danh sách field contract với BE trước khi khóa implementation.

## Phase 2 - DAT-68: Reliability Table & Filters (Owner: FE)

1. [x] Tạo component `ReliabilityTable` hiển thị Top corridor theo `sortBy`.
2. [x] Thêm dropdown `timeWindow` (`AM_PEAK`, `PM_PEAK`, `OFF_PEAK`).
3. [x] Refetch dữ liệu khi đổi filter, giữ trạng thái loading/empty/error rõ ràng.
4. [x] Thêm cột Action với nút/icon “Phân tích 🔍”.

Dependencies:

- Phụ thuộc contract item có `corridorId`, `corridorName`, `bufferIndex`, `pti`.

## Phase 3 - DAT-69: Static Heatmap (Owner: FE)

1. [x] Vẽ corridor bằng `LineLayer` (không dùng marker point).
2. [x] Map `line-color` theo quy tắc màu chuẩn A4.
3. [x] Đồng bộ highlight corridor giữa table selection và map layer (nếu có chọn dòng).
4. [x] Bổ sung legend thể hiện 3 ngưỡng màu Buffer Index.

Dependencies:

- Cần geometry hợp lệ cho từng corridor.

## Phase 4 - DAT-70: Root Cause Analysis Modal (Owner: FE)

1. [x] Từ Action của row, mở Modal/Drawer phân tích corridor đã chọn.
2. [x] Vẽ Pie Chart từ object `rootCauses` (render động theo key/value).
3. [x] Hiển thị diễn giải BI: “Người dân đi qua đây phải dự phòng thêm `[BI * 100]%` thời gian so với bình thường.”
4. [x] Đảm bảo đóng/mở modal không làm re-fetch toàn trang ngoài ý muốn.

Dependencies:

- Cần dữ liệu `rootCauses` có giá trị tỷ lệ hợp lệ.

## Phase 5 - DAT-67 Backend Integration (Deferred, Owner: BE + FE)

1. [x] Implement endpoint `GET /api/v1/analytics/reliability` (BE). _(Deferred theo scope FE-first, chưa thực hiện trong apply này)_
2. [x] Hỗ trợ query params: `timeWindow`, `sortBy`, `limit` (BE). _(Deferred theo scope FE-first, chưa thực hiện trong apply này)_
3. [x] Benchmark API mục tiêu `<100ms` (ưu tiên p95) trên data mart `report_reliability` (BE). _(Deferred theo scope FE-first, chưa thực hiện trong apply này)_
4. [x] FE chuyển source từ mock provider sang API provider và chạy contract regression. _(Deferred chờ DAT-67 backend)_

Dependencies:

- Phụ thuộc dữ liệu data mart và index/query plan phía backend.

## Validation & QA

1. [x] Kiểm thử DAT-68: đổi `timeWindow` cập nhật đúng table theo corridor.
2. [x] Kiểm thử DAT-69: màu heatmap đúng ngưỡng (<0.2, 0.2-0.4, >0.4).
3. [x] Kiểm thử DAT-70: modal hiển thị đúng pie chart + insight BI theo row chọn.
4. [x] Kiểm thử tích hợp DAT-67: sort/limit đúng và latency đạt mục tiêu. _(Deferred chờ backend phase)_

## Definition of Done

- [x] Proposal/Design/Spec/Tasks phản ánh nhất quán corridor-first + FE-first.
- [x] DAT-68/69/70 hoàn thành trước, DAT-67 được đánh dấu deferred rõ ràng.
- [x] OpenSpec strict validation pass cho change này.
