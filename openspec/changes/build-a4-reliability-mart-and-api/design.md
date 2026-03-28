# Design: A4 Reliability Mart + API Kickoff (DE/BE)

## 1. Kiến trúc tổng thể

Thiết kế gồm 3 lớp:

1. Data Mart layer (`report_reliability`) trong PostgreSQL, quản lý schema qua Prisma migration.
2. Batch computation layer (SQL-first) chạy định kỳ, ghi upsert vào mart.
3. Serving layer API (`GET /api/v1/analytics/reliability`) đọc mart để trả dữ liệu nhanh cho FE.

Batch orchestration dùng BullMQ + Redis tại backend service để lập lịch, retry, và theo dõi trạng thái chạy.

## 2. Data Flow

1. Scheduler đẩy job monthly/weekly vào queue `reliability-mart-batch`.
2. Worker nhận payload kỳ dữ liệu (`periodStart`, `periodEnd`, `sourcePeriod`).
3. Worker chạy SQL pipeline:
   - Compute metrics (`t_avg`, `t_95`, `t_freeflow`, `buffer_index`, `pti`).
   - Aggregate root causes theo incident type.
   - Upsert vào `report_reliability` theo unique key.
4. API đọc `report_reliability` theo query params và sort trả FE.

## 3. report_reliability Data Model

- Identity:
  - `segment_key`
  - `time_window`
  - `period_start`
  - `period_end`
- Metrics:
  - `t_avg`, `t_95`, `t_freeflow`, `buffer_index`, `pti`
- Root causes:
  - `cause_accident_count`, `cause_flood_count`, `cause_construction_count`
- Metadata:
  - `source_period`, `job_run_id`, `computed_at`, `quality_flag`

Định hướng unique constraint:

- `(segment_key, time_window, period_start, period_end)`

## 4. Time Window Strategy

Đề xuất mapping phase đầu:

- `AM_PEAK`: 07:00-09:59
- `PM_PEAK`: 16:00-19:59
- `OFF_PEAK`: 10:00-15:59 và 20:00-23:59
- `FREEFLOW` reference window: 00:00-04:00 (chỉ dùng tính `t_freeflow`)

Nếu business chốt mapping khác, chỉ cần cập nhật CTE phân loại giờ và giữ nguyên contract table/API.

## 5. Computation Strategy (SQL-first)

### 5.1 Base metrics

- Tính `travel_time` từ cột nguồn đã chốt (open question), sau đó group theo `segment_key` + `time_window`.
- `t_avg = AVG(travel_time)`
- `t_95 = percentile_cont(0.95) WITHIN GROUP (ORDER BY travel_time)`

### 5.2 Freeflow baseline

- Tính `t_freeflow` trên cùng kỳ `period_start/period_end`, giới hạn giờ 00:00-04:00 theo segment.

### 5.3 Derived metrics + guard rails

- `buffer_index = (t_95 - t_avg) / t_avg` nếu `t_avg > 0`, ngược lại null.
- `pti = t_95 / t_freeflow` nếu `t_freeflow > 0`, ngược lại null.
- Dòng thiếu dữ liệu đánh quality flag để downstream nhận biết.

## 6. Root-Cause Aggregation

- Primary join: theo `segment_key` + interval thời gian + `time_window`.
- Incident normalization:
  - ACCIDENT -> `cause_accident_count`
  - FLOOD -> `cause_flood_count`
  - CONSTRUCTION/ROADWORK -> `cause_construction_count`
- Fallback spatial join (optional, gated): chỉ khi incident thiếu `segment_key` và có geometry hợp lệ.

## 7. BullMQ Orchestration

- Queue: `reliability-mart-batch`
- Job name: `compute-reliability-period`
- Payload:
  - `periodStart`
  - `periodEnd`
  - `sourcePeriod` (`WEEKLY|MONTHLY`)
  - `forceRecompute` (optional)
- Idempotency:
  - Dùng `jobId` từ hash payload để tránh enqueue trùng kỳ.
  - Upsert mart theo unique key để re-run an toàn.
- Reliability settings:
  - `attempts` + exponential backoff
  - timeout theo kỳ dữ liệu
  - concurrency cấu hình qua env
- Observability:
  - log start/end/duration/record-count
  - log chi tiết lỗi SQL/Redis
  - cảnh báo khi vượt ngưỡng fail liên tiếp

## 8. Prisma & Migration Strategy

- Thêm model `report_reliability` trong `schema.prisma`.
- Tạo migration đặt tên theo intent (`add_report_reliability_mart`).
- Index đề xuất:
  - filter window/period: `(time_window, period_start, period_end)`
  - sort buffer index: `(time_window, period_start, period_end, buffer_index DESC)`
  - sort pti: `(time_window, period_start, period_end, pti DESC)`
  - lookup segment: `(segment_key, period_start, period_end)`

## 9. API Design

Endpoint: `GET /api/v1/analytics/reliability`

- Query validation:
  - `timeWindow`: enum `AM_PEAK|PM_PEAK|OFF_PEAK`
  - `sortBy`: enum `buffer_index|pti`
  - `limit`: integer > 0, bounded max
- Response mapping:
  - snake_case DB -> camelCase API
  - root causes đóng gói vào object `rootCauses`
- Error handling:
  - 400 invalid query
  - 404/200 empty theo policy hiện hữu
  - 500 internal errors

## 10. Trade-offs

- Dùng precompute mart làm giảm độ mới dữ liệu nhưng đảm bảo tốc độ API và ổn định hệ thống.
- Segment-level trước giúp đơn giản hóa join/compute, corridor-level để phase kế tiếp.
- Spatial fallback tăng độ phủ dữ liệu nhưng có chi phí, nên bật có điều kiện.

## 11. Validation & Benchmark

- Data validation:
  - kiểm tra null/zero guard rails
  - sample đối chiếu công thức BI/PTI
- API benchmark:
  - đo p95 với dataset kỳ tháng gần nhất
- Job reliability:
  - thử retry/backoff và idempotent re-run cùng kỳ
