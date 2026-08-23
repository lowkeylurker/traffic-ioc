# Proposal: [SE] A4 - Dashboard Độ tin cậy theo Corridor (DAT-66)

## Bối cảnh/Vấn đề

Nghiệp vụ A4 yêu cầu lãnh đạo nhìn nhanh corridor nào kém ổn định nhất theo chỉ số độ tin cậy (đặc biệt Buffer Index), đồng thời truy vết nguyên nhân chính để ưu tiên điều hành. Hiện tại chưa có dashboard chuyên sâu cho corridor reliability và cũng chưa có luồng UI thống nhất giữa bảng xếp hạng, heatmap tuyến, và phân tích nguyên nhân.

Để giảm rủi ro tiến độ MVP, phạm vi giai đoạn này ưu tiên **FE-first**: dựng đầy đủ trải nghiệm người dùng với data contract tạm thời/mock, còn API backend DAT-67 sẽ triển khai ở phase kế tiếp.

## Mục tiêu

- Cung cấp trang A4 hiển thị **Top corridor reliability ranking** (mặc định Top 10).
- Hiển thị **static corridor heatmap** bằng LineLayer, tô màu theo ngưỡng Buffer Index đã quy định.
- Cho phép mở **Modal/Drawer Root Cause Analysis** từ từng dòng bảng để xem tỷ lệ nguyên nhân bằng Pie Chart.
- Chuẩn bị data contract rõ ràng để backend DAT-67 tích hợp không phá vỡ UI.

## Phi mục tiêu

- Không implement backend endpoint thực tế trong giai đoạn này (DAT-67 deferred).
- Không triển khai realtime streaming/WebSocket cho A4.
- Không mở rộng phân tích ngoài corridor reliability (ví dụ forecast, simulation what-if).
- Không thay đổi kiến trúc auth/permission hiện hữu.

## In Scope

- DAT-68: Reliability table + bộ lọc `timeWindow`.
- DAT-69: Static corridor heatmap bằng LineLayer, map `line-color` theo `buffer_index`.
- DAT-70: Action “Phân tích” và Modal/Drawer Pie Chart + diễn giải BI.
- FE data adapter cho data contract chuẩn hóa camelCase và fallback mock.

## Out of Scope

- DAT-67 implementation backend endpoint `GET /api/v1/analytics/reliability`.
- Tối ưu DB/query plan vật lý cho SLA API (ghi nhận ở phase backend).
- Workflow drill-down sâu sang dashboard khác ngoài A4.

## Phạm vi theo Sub-ticket

### DAT-68 - Reliability Table & Filters (FE)

- Tạo `ReliabilityTable` cho Top corridor theo `bufferIndex`/`pti`.
- Dropdown `timeWindow`: `AM_PEAK`, `PM_PEAK`, `OFF_PEAK`.
- Khi đổi filter: refetch từ API (khi có backend) hoặc mock provider (giai đoạn FE-first).
- Cột Action có nút “Phân tích”.

### DAT-69 - Static Heatmap (FE)

- Vẽ corridor bằng `LineLayer` (không dùng marker).
- Map `line-color` theo `buffer_index`:
  - `< 0.2`: xanh (ổn định)
  - `0.2 - 0.4`: vàng/cam (thất thường)
  - `> 0.4`: đỏ sẫm (báo động)
- Đồng bộ màu giữa table badge và map legend để tránh hiểu sai.

### DAT-70 - Root Cause Analysis Modal (FE)

- Bổ sung action icon “Phân tích 🔍” trên từng dòng.
- Mở Modal/Drawer chứa Pie Chart từ `rootCauses` của corridor đã chọn.
- Hiển thị diễn giải: “Người dân đi qua đây phải dự phòng thêm `[BI * 100]%` thời gian so với bình thường.”

### DAT-67 - Reliability API (Deferred)

- Ghi nhận là dependency phase sau.
- FE phải không phụ thuộc chặt vào source thật: dùng data contract ổn định + adapter.

## Kiến trúc FE-first

- Page-level state quản lý: `timeWindow`, `sortBy`, `limit`, `selectedCorridor`, `loading/error`.
- Data flow: `filters -> fetchProvider(API|mock) -> normalize -> render(table/map/modal)`.
- Tách mapping màu heatmap thành utility dùng chung cho table/map/legend.
- Root cause modal đọc trực tiếp object `rootCauses` của row đang chọn, không gọi API phụ.

## API Contract Draft (Planned - Phase Backend)

Endpoint: `GET /api/v1/analytics/reliability`

Query params:

- `timeWindow`: `AM_PEAK | PM_PEAK | OFF_PEAK`
- `sortBy`: `buffer_index | pti`
- `limit`: number

Response item draft:

- `corridorId`: string | number
- `corridorName`: string
- `bufferIndex`: number
- `pti`: number
- `rootCauses`: object (`accident`, `flood`, `construction`, ...)
- `geometry`: GeoJSON LineString/MultiLineString (hoặc reference key để map client join)

## UX/Interaction Details

- Bố cục 3 khối: filter + ranking table, static heatmap map pane, root-cause modal.
- User chọn `timeWindow` -> table và heatmap cập nhật đồng thời.
- User click “Phân tích” -> modal mở theo corridor tương ứng, pie chart + diễn giải BI.
- Empty/error/loading state rõ ràng, tránh blocking toàn trang khi chỉ một widget lỗi.

## Quy tắc màu Heatmap (Bắt buộc)

- `buffer_index < 0.2`: **Xanh** (Ổn định)
- `0.2 <= buffer_index <= 0.4`: **Vàng/Cam** (Thất thường)
- `buffer_index > 0.4`: **Đỏ sẫm** (Báo động - Rất kém tin cậy)

## Hiệu năng mục tiêu

- Phase backend (planned): endpoint reliability mục tiêu `< 100ms` (ưu tiên p95).
- Phase FE-first hiện tại: render map/table mượt với Top 10–Top N corridor, tránh re-render không cần thiết khi mở/đóng modal.

## Rủi ro & Phụ thuộc

- Chưa có API thật: cần mock contract ổn định để giảm refactor khi DAT-67 hoàn tất.
- Geometry quality phụ thuộc nguồn corridor tuyến; cần thống nhất format GeoJSON sớm.
- Root cause keys có thể thay đổi theo backend: cần cơ chế render động từ object key/value.
- Risk sai lệch màu nếu mapping được duplicate nhiều nơi.

## Chiến lược rollout

1. Phase 1 (FE-first): DAT-68 + DAT-69 + DAT-70 với mock provider và contract chuẩn.
2. Phase 2 (BE): DAT-67 implement API + benchmark <100ms.
3. Phase 3 (Integration): switch provider sang API thật, kiểm thử contract và UX end-to-end.

## Acceptance Criteria

1. Ranking table hiển thị đúng danh sách corridor và cho phép đổi `timeWindow`.
2. Heatmap vẽ đúng corridor và tô màu đúng ngưỡng Buffer Index.
3. Click “Phân tích” mở modal pie chart đúng dữ liệu `rootCauses` của corridor đã chọn.
4. Diễn giải BI hiển thị đúng công thức `[bufferIndex * 100]%`.
5. Sau khi tích hợp backend, API trả đúng sort/limit và đáp ứng mục tiêu hiệu năng.

## Definition of Done

- Proposal xác định rõ FE-first scope và DAT-67 deferred.
- Có spec delta và tasks theo thứ tự triển khai thực tế.
- Có data contract draft đủ để FE triển khai không chờ backend.
- `openspec validate <change-id> --strict --no-interactive` pass.

## Open Questions

1. `rootCauses` có chuẩn hóa cố định 3 nhóm (`accident`, `flood`, `construction`) hay cho phép danh mục mở rộng?
2. Geometry corridor trả trực tiếp theo item hay map qua `corridorId` từ endpoint geometry khác?
3. KPI “Top 10” có luôn cố định 10 hay cho phép người dùng đổi `limit` trên UI?
4. Khi `bufferIndex` bằng đúng 0.2 hoặc 0.4, màu đã chốt thuộc nhóm vàng/cam (inclusive), có cần hiển thị label ngưỡng trong legend không?
