# Tasks: [SE] A3 - API Đa dụng & Dashboard Phát hiện Bất thường

## Phase 1 - DB/Data (Owner: DE)

1. [ ] Xác nhận baseline source chính thức (materialized view/table) cho 8 metric, thống nhất key join theo segment + hour + date/week profile.
2. [ ] Rà soát index phục vụ query comparison: segment_key, date_key, time_key, metric cột/derived fields.
3. [ ] Bổ sung/đổi mới refresh strategy baseline nếu cần để đảm bảo dữ liệu ổn định cho A3.
4. [ ] Định nghĩa data quality checks cho 24-hour completeness và stdDev hợp lệ.

Dependencies:

- Cần thống nhất metric dictionary với BE trước khi chốt mapping cột.

## Phase 2 - Backend API (Owner: BE)

1. [x] Tạo endpoint GET /api/v1/analytics/comparison trong module analytics.
2. [x] Thêm query validation cho segmentId, metric, date; trả lời 400/404/500 theo spec.
3. [x] Implement SQL-first merge baseline + today theo 24 giờ, tính lowerBound/upperBound/isAnomaly.
4. [x] Clamp lowerBound >= 0 cho metric không âm.
5. [x] Chuẩn hóa response camelCase và unit mapping theo metric enum.
6. [ ] Thêm benchmark script/test để xác minh p95 < 200ms.

Dependencies:

- Phụ thuộc baseline source đã sẵn sàng ở Phase 1.

## Phase 3 - Frontend Reusable Chart (Owner: FE)

1. [x] Tạo reusable comparison chart component (Area band + Baseline line + Today line).
2. [x] Hiển thị anomaly points màu đỏ khi isAnomaly = true.
3. [x] Viết custom tooltip hiển thị baselineAvg, stdDev, bounds, todayValue, unit.
4. [x] Hỗ trợ dynamic Y-axis unit theo metric và responsive behavior.
5. [x] Xử lý UI states: loading, empty, error.

Dependencies:

- Cần contract response API ổn định từ Phase 2.

## Phase 4 - Dashboard Assembly (Owner: FE)

1. [x] Tạo/bổ sung trang A3 dashboard với 2 dropdown: segment và metric.
2. [x] Chia 8 metric thành 3 nhóm trong metric dropdown theo spec.
3. [x] Quản lý state filter + refetch mỗi khi thay đổi filter/date.
4. [x] Implement polling 5 phút (300000ms) và chống duplicate request.
5. [x] Đảm bảo chuyển đổi use-case nhanh giữa các segment/metric vẫn mượt.

Dependencies:

- Cần reusable chart và API đã hoạt động.

## Phase 5 - Integration & QA (Owner: QA + BE/FE support)

1. [ ] Tạo test matrix đủ 8 metric x nhiều segment x ngày đại diện.
2. [ ] Kiểm thử acceptance cho A3.1:

- [ ] API trả 24 phần tử/24 giờ đúng schema.
- [ ] isAnomaly tính đúng theo bounds.
- [ ] Đạt target response time < 200ms (p95).

3. [ ] Kiểm thử acceptance cho A3.2:

- [ ] Chart hiển thị đủ Baseline/Band/Today.
- [ ] Điểm anomaly đỏ hiển thị rõ ràng.
- [ ] Đổi unit trục Y không crash.

4. [ ] Kiểm thử acceptance cho A3.3:

- [ ] Dropdown segment/metric refetch đúng.
- [ ] Polling 5 phút ổn định, không request dư.
- [ ] Trải nghiệm chuyển đổi qua lại mượt.

5. [ ] Chốt UAT checklist và sign-off trước khi chuyển sang implementation.

## Definition of Done

- [x] Có đủ 4 artifact: change.yaml, proposal.md, spec.md, tasks.md.
- [x] Requirement và task có traceability rõ theo A3.1/A3.2/A3.3.
- [x] OpenSpec validate strict pass cho change-id này.
- [ ] Còn lại chỉ là implementation stage, không cần bổ sung requirement mới.

## Open Questions

1. Mục tiêu response time < 200ms áp dụng p95 hay p99 trong SLA chính thức?
2. Có cần fallback visual khi metric unit không xác định từ backend không?
3. Mức độ ưu tiên cache: bắt buộc trong phase đầu hay để phase tối ưu sau?
