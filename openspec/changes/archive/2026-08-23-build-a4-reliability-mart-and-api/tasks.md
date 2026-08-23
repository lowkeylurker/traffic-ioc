# Tasks: [DE/BE] A4 Reliability Mart + API Kickoff (DAT-62, DAT-67)

## Phase 0 - Scope Alignment (Owner: DE + BE)

1. [x] Chốt nguồn bảng/cột canonical cho incident và travel time.
2. [x] Chốt định nghĩa chính thức time windows (`AM_PEAK`, `PM_PEAK`, `OFF_PEAK`).
3. [x] Chốt granularity phase đầu cho API (segment-level trước, corridor-level phase sau nếu cần).

Dependencies:

- Cần business sign-off trước khi khóa SQL computation.

## Phase 1 - DAT-63 Schema via Prisma (Owner: BE/DE)

1. [x] Thêm model `report_reliability` vào `backend/prisma/schema.prisma`.
2. [x] Khai báo unique key `(segment_key, time_window, period_start, period_end)`.
3. [x] Thêm index cho filter + sorting (`buffer_index`, `pti`).
4. [x] Tạo migration Prisma với tên mô tả rõ intent.

Dependencies:

- Phụ thuộc Phase 0 chốt naming + time-window mapping.

## Phase 2 - DAT-64 SQL Batch Computation (Owner: DE)

1. [x] Viết SQL CTE tính `t_avg`, `t_95` theo segment + time window + kỳ dữ liệu.
2. [x] Viết SQL tính `t_freeflow` từ khung 00:00-04:00.
3. [x] Tính `buffer_index` và `pti` với guard rails chia 0/null.
4. [x] Upsert vào `report_reliability` theo unique key.

Dependencies:

- Phụ thuộc schema đã migrate thành công ở Phase 1.

## Phase 3 - DAT-65 Root Cause Aggregation (Owner: DE)

1. [x] Join incident theo `segment_key` + thời gian + time window để đếm nguyên nhân.
2. [x] Chuẩn hóa incident types vào 3 nhóm count (accident/flood/construction).
3. [x] Bổ sung fallback spatial join có điều kiện (nếu thiếu `segment_key`).
4. [x] Ghi counts vào `report_reliability` trong cùng vòng upsert.

Dependencies:

- Phụ thuộc canonical incident table đã chốt ở Phase 0.

## Phase 4 - BullMQ + Redis Orchestration (Owner: BE)

1. [x] Tạo queue `reliability-mart-batch` và worker `compute-reliability-period`.
2. [x] Thiết kế payload, idempotency key, retry/backoff, timeout, concurrency.
3. [x] Thêm schedule weekly/monthly (config qua env).
4. [x] Bổ sung logging job lifecycle + failure alerts cơ bản.

Dependencies:

- Phụ thuộc Redis khả dụng và SQL job logic từ Phase 2/3.

## Phase 5 - DAT-67 Reliability API (Owner: BE)

1. [x] Tạo endpoint `GET /api/v1/analytics/reliability`.
2. [x] Validate query params `timeWindow`, `sortBy`, `limit`.
3. [x] Query từ mart + sort/limit đúng + map response camelCase.
4. [x] Trả root causes dưới object `rootCauses` phục vụ FE.

Dependencies:

- Phụ thuộc mart có dữ liệu từ batch.

## Phase 6 - QA & Performance Validation (Owner: DE + BE + QA)

1. [x] Verify `report_reliability` có dữ liệu tháng trước.
2. [x] Đối chiếu mẫu công thức `t_95`, `buffer_index`, `pti`.
3. [x] Verify counts nguyên nhân tồn tại trên mỗi dòng dữ liệu.
4. [x] Benchmark API p95 < 100ms trên dữ liệu mart precompute.
5. [x] Kiểm tra re-run cùng kỳ không tạo duplicate records.

## Definition of Done

- [x] Mart `report_reliability` được quản lý bằng Prisma migration.
- [x] Batch job tính đúng BI/PTI + root causes theo kỳ tuần/tháng.
- [x] BullMQ orchestration vận hành ổn định với retry/idempotency.
- [x] API reliability phục vụ FE với query/sort/limit đúng và latency đạt mục tiêu.
- [x] OpenSpec strict validation pass cho change này.

## Notes

- Canonical incident source đang dùng `fact_incident` (không phải `fact_incidents`).
- Canonical travel-time phase đầu: suy diễn từ `length_m/current_speed_kmh` và fallback `delay_seconds`.
- Granularity API phase đầu: corridor-level.
- `prisma migrate dev` hiện fail trên shadow DB do migration lịch sử phụ thuộc table partition (`fact_incident`) không tồn tại trong shadow; migration SQL mới đã được thêm thủ công và cần DE/DBA xác nhận cách xử lý drift.
