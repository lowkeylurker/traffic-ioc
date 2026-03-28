# Design: A4 Corridor Reliability Dashboard (FE-first)

## 1. Mục tiêu thiết kế

Thiết kế một luồng UI thống nhất cho corridor reliability gồm ranking table, static heatmap, và root-cause modal theo hướng FE-first để triển khai nhanh MVP, đồng thời giảm chi phí refactor khi backend DAT-67 hoàn tất.

## 2. Phạm vi kiến trúc

- **Trong scope:** Frontend page composition, state flow, rendering strategy, temporary data provider.
- **Ngoài scope:** SQL/query optimization, API implementation chi tiết phía backend.

## 3. State & Data Flow

- Shared page state:
  - `timeWindow`
  - `sortBy`
  - `limit`
  - `selectedCorridor`
  - `loading`, `error`
- Data pipeline:
  1. User đổi filter.
  2. Fetch từ `reliabilityProvider` (mock ở phase FE-first).
  3. Normalize về contract camelCase.
  4. Bind dữ liệu cho table + map.
  5. Click action row -> set `selectedCorridor` -> mở modal pie chart.

## 4. Contract-first Strategy

- Định nghĩa interface thống nhất ngay từ đầu cho `CorridorReliabilityItem`.
- Mock provider trả đúng shape contract planned để thay backend không đổi UI logic.
- Color mapping utility dùng chung để tránh lệch ngưỡng giữa table/map/legend.

## 5. Heatmap Rendering Strategy

- Dùng `LineLayer` để thể hiện corridor geometry.
- `line-color` lấy từ `bufferIndex` theo ngưỡng chuẩn.
- Mỗi feature trong source map cần giữ `corridorId` để sync highlight từ table.

## 6. Root Cause Modal Strategy

- Nguồn dữ liệu pie chart đọc từ `rootCauses` của row hiện tại.
- Render động theo key/value để không phụ thuộc cứng 3 nguyên nhân.
- Tính textual insight trực tiếp từ `bufferIndex`:
  - `extraTimePercent = bufferIndex * 100`

## 7. Trade-offs

- **FE-first lợi ích:** giảm block phụ thuộc backend, có thể demo sớm trải nghiệm A4.
- **Chi phí:** cần mock maintenance tạm thời và test thêm khi switch sang API thật.
- **Giảm rủi ro:** cố định contract + adapter layer, tránh logic map/table phụ thuộc trực tiếp raw response.

## 8. Kế hoạch tích hợp backend (Phase sau)

- Thay `reliabilityProvider` mock bằng API client `GET /api/v1/analytics/reliability`.
- Giữ nguyên UI components; chỉ thay data source + normalization nhỏ nếu cần.
- Chạy contract test để xác minh tương thích field: `corridorId`, `corridorName`, `bufferIndex`, `pti`, `rootCauses`, `geometry`.

## 9. Rủi ro kỹ thuật chính

- Dữ liệu geometry corridor thiếu/không hợp lệ sẽ làm heatmap khó render đồng bộ.
- Keys `rootCauses` không nhất quán có thể làm pie chart thiếu nhãn.
- Nếu số corridor lớn hơn kỳ vọng, cần bổ sung virtualization hoặc phân trang table ở phase tối ưu.
