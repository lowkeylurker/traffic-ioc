# AI Core

`ai-core` là service AI/ML của Traffic IOC. Module này cung cấp:

- Dự báo tắc nghẽn cho App qua API public.
- Benchmark và debug fallback qua API internal.
- Các artifact RL, metrics, histories, checkpoints phục vụ huấn luyện và suy luận.

## Chạy nhanh

Từ thư mục gốc `traffic-ioc/`:

```bash
docker-compose up -d ai-core
```

Mở các địa chỉ sau:

- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`
- OpenAPI JSON: `http://localhost:5000/openapi.json`

## API cho App

### Public API

`POST /api/v1/congestion-prediction/batch`

Dùng để dự báo tắc nghẽn theo danh sách segment. Đây là endpoint App nên gọi trong luồng production.

### Internal API

- `GET /api/internal/v1/congestion-prediction/debug-fallback`
- `POST /api/internal/v1/congestion-prediction/benchmark`

Hai endpoint này chỉ dùng cho debug, kiểm tra fallback và đo hiệu năng.

## Cách dùng API từ App

### 1. Request batch prediction

```bash
curl -X POST "http://localhost:5000/api/v1/congestion-prediction/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "segment_ids": [101, 202, 303],
    "request_time": "2026-04-15T09:30:00",
    "prediction_horizon_minutes": 15
  }'
```

### 2. Ý nghĩa response

Mỗi item trả về có các field chính:

- `segment_id`: segment gốc App yêu cầu.
- `congestion_level`: mức tắc nghẽn 0-5.
- `status`: `ok`, `no_data`, hoặc `error`.
- `reason_code`: lý do ra kết quả, ví dụ `DIRECT`, `FALLBACK_NEAREST`, `NO_VALID_WINDOW`.
- `used_fallback`: `true` nếu hệ thống phải lấy từ segment thay thế.
- `source_segment_id`: segment nguồn nếu có fallback.
- `fallback_distance_m`: khoảng cách fallback tính theo mét.

### 3. Cách xử lý ở App

- Nếu `status = ok` và `reason_code = DIRECT`, hiển thị kết quả trực tiếp.
- Nếu `status = ok` và `used_fallback = true`, vẫn có thể hiển thị kết quả nhưng nên gắn nhãn fallback.
- Nếu `status = no_data`, App nên hiển thị trạng thái không đủ dữ liệu hoặc fallback không thành công.
- Chỉ dùng `segment_ids` hợp lệ, số nguyên dương.
- `prediction_horizon_minutes` hiện chỉ hỗ trợ `15`.

## Benchmark và debug

### Benchmark nội bộ

```bash
curl -X POST "http://localhost:5000/api/internal/v1/congestion-prediction/benchmark" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 5, "num_runs": 1, "seed": 42, "prediction_horizon_minutes": 15}'
```

Trả về:
- `p50_latency_ms`
- `p95_latency_ms`
- `avg_latency_ms`
- `throughput_per_second`
- `success_rate_pct`
- `direct_hit_rate_pct`
- `fallback_hit_rate_pct`
- `no_data_rate_pct`

### Debug fallback nội bộ

```bash
curl "http://localhost:5000/api/internal/v1/congestion-prediction/debug-fallback?segment_id=101&request_time=2026-04-15T09:30:00&limit=8"
```

Dùng để xem corridor nào được map, candidate nào được thử, candidate nào bị loại do khoảng cách hoặc do không có valid window.

## Chạy test

```bash
docker-compose exec ai-core python -m pytest src/tests/test_congestion_batch_route.py -q
```

## Cấu trúc chính

- `src/api/`: FastAPI app và routes.
- `src/schemas/`: request/response schema, enum contract.
- `src/data_access/`: truy vấn DB và lookup corridor/candidate.
- `src/rl/`: inference, artifacts, training utilities.
- `docs/`: tài liệu vận hành và workflow.
- `artifacts/rl/`: checkpoints, metrics, histories, benchmark outputs.

## Lưu ý

- Swagger UI và API chỉ hoạt động khi `ai-core` container đang chạy.
- Public API dành cho App; internal API không nên dùng trong luồng production.
- Các checkpoint/metric RL được quản lý trong `artifacts/rl/` để giữ workspace gọn gàng.
