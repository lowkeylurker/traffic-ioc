# Proposal: [DE/BE] A4 Reliability Data Mart + Reliability API Kickoff (DAT-62, DAT-67)

## Why

A4 cần dữ liệu độ tin cậy ổn định, đã tiền xử lý để frontend và lãnh đạo có thể xem ngay Top corridor/segment kém ổn định mà không phải chạy query phân tích nặng theo thời gian thực. Hiện tại chưa có Data Mart tĩnh `report_reliability` và chưa có batch job chuẩn để tính BI/PTI theo kỳ, đồng thời chưa có API `/api/v1/analytics/reliability` phục vụ tích hợp FE sớm.

Việc bổ sung Data Mart + batch orchestration bằng BullMQ/Redis giúp tách tải tính toán khỏi request online, giữ latency API thấp (mục tiêu p95 < 100ms), và tạo nền tảng mở rộng từ segment-level sang corridor-level theo phase.

## Bối cảnh/Vấn đề

- Chưa có bảng Data Mart `report_reliability` quản lý bằng Prisma migration.
- Chưa có pipeline định kỳ để tính `t_avg`, `t_95`, `t_freeflow`, `buffer_index`, `pti` theo `timeWindow`.
- Chưa có bước chuẩn hóa root-cause counts (`accident/flood/construction`) gắn trực tiếp vào dòng mart.
- Chưa có API reliability contract chính thức cho FE A4 dùng production data.

## What Changes

- Thêm schema/migration cho bảng mart `report_reliability` với unique key và index phục vụ filter/sort.
- Bổ sung SQL batch computation (CTE) tính `t_avg`, `t_95`, `t_freeflow`, `buffer_index`, `pti` và root-cause counts.
- Tích hợp BullMQ + Redis cho queue `reliability-mart-batch`, worker `compute-reliability-period`, retry/backoff, schedule weekly/monthly.
- Bổ sung endpoint `GET /api/v1/analytics/reliability` với validate `timeWindow`, `sortBy`, `limit` và response camelCase.

## Mục tiêu

- Tạo bảng `report_reliability` (table tĩnh, không phải view) bằng Prisma schema + migration.
- Thiết kế batch SQL-first tính chỉ số reliability theo segment + time window, theo kỳ tuần/tháng.
- Tích hợp root-cause aggregation theo ưu tiên join `segment_key`; có fallback geo join khi thiếu mapping.
- Thiết kế và bắt đầu phạm vi API `GET /api/v1/analytics/reliability` để FE tích hợp sớm.
- Vận hành batch qua BullMQ + Redis với idempotency, retry, observability cơ bản.

## Phi mục tiêu

- Không triển khai realtime stream reliability.
- Không thay đổi auth/permission hiện hữu.
- Không mở rộng full corridor-native mart ở phase đầu (corridor tổng hợp sẽ là phase tiếp theo nếu cần).
- Không thay đổi toàn bộ mô hình fact hiện có ngoài phần cần thiết cho mart/API.

## In Scope

- DAT-63: schema `report_reliability` qua Prisma.
- DAT-64: batch SQL tính BI/PTI theo kỳ.
- DAT-65: join/aggregate nguyên nhân sự cố và ghi vào mart.
- DAT-67 kickoff: API reliability query `timeWindow`, `sortBy`, `limit` dùng mart precompute.
- BullMQ + Redis orchestration cho batch job reliability.

## Out of Scope

- Dashboard UI implementation chi tiết (đã thuộc FE ticket).
- Tuning sâu infra production (autoscaling workers, distributed tracing full stack).
- Triển khai geospatial enrichment phức tạp ngoài fallback tối thiểu.

## Capability Breakdown

1. `de-a4-reliability-mart-schema`
2. `de-a4-reliability-batch-computation`
3. `de-a4-root-cause-aggregation`
4. `be-a4-reliability-job-orchestration-bullmq`
5. `be-a4-reliability-api`

## Data Model Draft: report_reliability

Identity đề xuất (unique record):

- `segment_key`
- `time_window` (`AM_PEAK|PM_PEAK|OFF_PEAK`)
- `period_start`
- `period_end`

Core metrics:

- `t_avg`
- `t_95`
- `t_freeflow`
- `buffer_index`
- `pti`

Root-cause counts:

- `cause_accident_count`
- `cause_flood_count`
- `cause_construction_count`

Batch metadata:

- `job_run_id`
- `computed_at`
- `source_period` (WEEKLY/MONTHLY)

## Time Window Mapping (đề xuất)

- `AM_PEAK`: 07:00-09:59
- `PM_PEAK`: 16:00-19:59
- `OFF_PEAK`: 10:00-15:59 và 20:00-23:59 (tách khỏi khung 00:00-04:00 dùng riêng cho `t_freeflow`)

Lưu ý: định nghĩa OFF_PEAK cần chốt nghiệp vụ chính thức trong Open Questions.

## Công thức & Guard Rails

- `t_95 = percentile_cont(0.95) WITHIN GROUP (ORDER BY travel_time)`
- `t_freeflow`: thời gian di chuyển trung bình tại khung 00:00-04:00
- `buffer_index = (t_95 - t_avg) / t_avg`
- `pti = t_95 / t_freeflow`

Guard rails:

- Nếu `t_avg` hoặc `t_freeflow` null/0 thì metric chia bị set null + gắn quality flag.
- Nếu dữ liệu điểm đo dưới ngưỡng tối thiểu thì bỏ qua record hoặc ghi với status incomplete.
- Outlier handling ngoài P95 được ghi nhận là optional tối ưu sau (không bắt buộc phase này).

## Root Cause Aggregation Strategy

- Primary: join theo `segment_key` + khoảng thời gian + time window.
- Fallback (khi thiếu mapping segment): spatial join có kiểm soát chi phí (PostGIS), chỉ bật khi cần và có điều kiện dữ liệu.
- Chuẩn hóa incident type mapping về `accident`, `flood`, `construction`.

## API Contract Draft (Kickoff)

Endpoint: `GET /api/v1/analytics/reliability`

Query params:

- `timeWindow`: `AM_PEAK|PM_PEAK|OFF_PEAK`
- `sortBy`: `buffer_index|pti`
- `limit`: integer (default 10, max giới hạn theo policy)

Response item (camelCase):

- `segmentKey`
- `segmentName`
- `timeWindow`
- `periodStart`
- `periodEnd`
- `tAvg`
- `t95`
- `tFreeflow`
- `bufferIndex`
- `pti`
- `rootCauses` object `{ accident, flood, construction }`

Error shape: theo chuẩn API hiện tại (`success`, `statusCode`, `message`, `error`, `timestamp`).

Perf target: p95 < 100ms trên mart đã precompute và có index phù hợp.

## BullMQ/Redis Design Summary

- Queue name: `reliability-mart-batch`
- Job payload: `{ periodStart, periodEnd, sourcePeriod, forceRecompute }`
- Idempotency key: hash của `sourcePeriod + periodStart + periodEnd`
- Retry/backoff: exponential retry cho lỗi transient DB/Redis
- Timeout + concurrency: giới hạn theo tài nguyên worker
- Observability: structured logs + trạng thái job + cảnh báo khi fail liên tiếp

## Prisma Strategy

- Thêm model `report_reliability` vào `schema.prisma`.
- Migration theo convention mô tả rõ intent (vd: `add_report_reliability_mart`).
- Thêm index cho pattern query API: `(time_window, period_start, period_end, buffer_index)` và tương tự cho `pti`.
- Giữ định danh/unique constraint để hỗ trợ upsert idempotent.

## Rollout Plan

1. Phase 1: Prisma schema + migration + SQL core computation.
2. Phase 2: Root-cause aggregation + data quality guard rails.
3. Phase 3: BullMQ orchestration + scheduler + retry/observability.
4. Phase 4: API reliability + benchmark + integration FE.

## Acceptance Criteria

1. Bảng `report_reliability` được tạo bằng Prisma migration và có dữ liệu tháng trước.
2. Công thức `percentile_cont(0.95)` chạy đúng cho `t_95` và tính được BI/PTI theo công thức đã chốt.
3. Mỗi dòng có sẵn counts nguyên nhân (`cause_accident_count`, `cause_flood_count`, `cause_construction_count`).
4. API reliability trả đúng `timeWindow/sortBy/limit`, response camelCase, phục vụ FE A4.
5. Mục tiêu latency API p95 < 100ms đạt trên dữ liệu mart đã tiền xử lý.

## Risks & Dependencies

- Ambiguity nguồn `travel_time` trong fact flow có thể làm sai công thức nếu map không nhất quán.
- Khác biệt tên bảng incident (`fact_incident` vs `fact_incidents`) ảnh hưởng join.
- Dữ liệu freeflow (00:00-04:00) thiếu có thể làm PTI null nhiều.
- Spatial fallback join có thể tốn chi phí nếu không giới hạn chặt.

## Open Questions

1. Bảng chuẩn để join sự cố là `fact_incident` hay `fact_incidents`?
2. `travel_time` lấy từ cột nào trong `fact_traffic_flow` (trực tiếp hay suy diễn từ `length_m/current_speed_kmh` hoặc `delay_seconds`)?
3. Định nghĩa chính thức của `OFF_PEAK` là gì?
4. API phase đầu chốt granularity `segment-level` hay `corridor-level`?
