# AI Core

`ai-core` là service AI/ML của Traffic IOC, cung cấp suy luận dự báo tắc nghẽn cho App và các công cụ nội bộ phục vụ kiểm tra, benchmark, và chẩn đoán fallback.

## Tổng quan dịch vụ

- Public API: phục vụ App gọi trong luồng production.
- Internal API: phục vụ debug, benchmark, và kiểm tra chất lượng dữ liệu.
- Tài nguyên mô hình và kết quả huấn luyện được tổ chức trong `artifacts/rl/`.

## Cài đặt và chạy

Từ thư mục gốc `traffic-ioc/`:

```bash
docker-compose up -d ai-core
```

Kiểm tra nhanh:

```bash
docker-compose ps
docker-compose logs -f ai-core
```

Chạy test:

```bash
docker-compose exec ai-core python -m pytest src/tests/test_congestion_batch_route.py -q
```

## Swagger và tài liệu API

- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`
- OpenAPI JSON: `http://localhost:5000/openapi.json`

### Nhóm endpoint trong Swagger

- `congestion-rl-public`: endpoint public cho App.
- `congestion-rl-internal`: endpoint nội bộ cho benchmark và debug.

## Dùng cho App

App chỉ nên gọi endpoint public:

- `POST /api/v1/congestion-prediction/batch`

Payload nhận danh sách `segment_ids`, thời điểm request, và `prediction_horizon_minutes`.

Kết quả trả về có các trường quan trọng như:

- `status`
- `reason_code`
- `used_fallback`
- `source_segment_id`
- `fallback_distance_m`

Ý nghĩa sử dụng:

- `DIRECT`: kết quả suy luận trực tiếp.
- `FALLBACK_NEAREST`: lấy từ segment thay thế gần nhất trong cùng corridor.
- `no_data`: không có kết quả hợp lệ.

## Tham khảo cấu trúc dự án

- `src/api/`: FastAPI app và routes.
- `src/schemas/`: request/response schema và enum contract.
- `src/data_access/`: truy vấn DB và lookup corridor/candidate.
- `src/rl/`: inference, artifacts, training utilities.
- `docs/`: tài liệu vận hành và workflow.
- `artifacts/rl/`: checkpoints, metrics, histories, benchmark outputs.

## Ghi chú

- Swagger UI chỉ hoạt động khi container `ai-core` đang chạy.
- App nên dùng API public, không phụ thuộc các endpoint internal.
- Các artifact RL không nên để rải ở gốc repo; hãy dùng `artifacts/rl/` để giữ workspace gọn gàng.
