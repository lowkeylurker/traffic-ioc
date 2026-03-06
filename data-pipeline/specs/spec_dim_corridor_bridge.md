# SEED CONTEXT: DATA SPECIFICATION FOR `dim_corridor` & `bridge_corridor_segment`

**Tới AI/Copilot:** Khi bạn được yêu cầu viết Pydantic Schema, Transformer hoặc Loader cho dữ liệu Hành lang tuyến giao thông (Corridors), BẠN BẮT BUỘC phải tuân thủ nghiêm ngặt các cấu trúc và quy tắc dưới đây. Đây là một luồng nạp dữ liệu cấu hình tĩnh (Static Configuration Pipeline).

## 1. SOURCE DATA (Dữ liệu đầu vào)
- **Nguồn:** Không lấy từ API. Dữ liệu này được đọc từ file cấu hình tĩnh `corridors_config.json` hoặc được định nghĩa sẵn bằng các list of dicts trong script tạo dữ liệu ban đầu.
- **Tính chất:** Dữ liệu hành lang là các tuyến đường huyết mạch đã được Sở GTVT quy hoạch (Ví dụ: Trục Đông-Tây, Trục Bắc-Nam).

## 2. TARGET SCHEMAS (Cấu trúc Database)

### A. Bảng `dim_corridor` (Chứa thông tin tổng quan của tuyến)
- `corridor_key` (Integer, Primary Key) - Khóa chính (Tự tăng hoặc Hash).
- `corridor_name` (String / VARCHAR) - Tên hành lang tuyến (Ví dụ: "Trục Đại lộ Võ Văn Kiệt").
- `importance_level` (SmallInt / Integer) - Mức độ quan trọng của tuyến (1-5, 1 là cao nhất).
- `target_avg_speed_kmh` (DECIMAL(5,2)) - Tốc độ mục tiêu trên tuyến (km/h).
- `total_length_m` (DECIMAL(12,2)) - Tổng chiều dài của hành lang (m).
- `direction` (String / VARCHAR) - Hướng di chuyển (Ví dụ: "Inbound", "Outbound", "East-West", "North-South").
- `is_active` (Boolean) - Trạng thái hoạt động (Mặc định: True).

### B. Bảng trung gian `bridge_corridor_segment` (Chứa các đoạn đường cấu thành)
- `corridor_key` (Integer, Foreign Key) - Tham chiếu tới `dim_corridor`.
- `segment_key` (Integer/BIGINT, Foreign Key) - Tham chiếu tới `dim_segment` (OSM Edge).
- `sequence_order` (Integer) - **TRƯỜNG BẮT BUỘC.** Xác định thứ tự đoạn đường từ đầu tuyến đến cuối tuyến. Phải bắt đầu từ 1 và tăng dần. Rất quan trọng để tính thời gian di chuyển dọc tuyến.

## 3. TRANSFORM & BUSINESS RULES (Quy tắc biến đổi)
BẮT BUỘC viết các hàm Transform xử lý logic sau:

### A. Logic kiểm tra tính liên tục (Sequence Validation)
- Dữ liệu đầu vào của một Corridor phải chứa một danh sách các `segment_id_source` (từ OSM).
- Khi biến đổi, phải gắn đúng `sequence_order` theo đúng thứ tự mảng đầu vào (`index + 1`).
- Tuyệt đối không được phép có 2 segment trong cùng một hành lang trùng `sequence_order`.

### B. Sinh khóa (Key Generation)
- `corridor_key`: Có thể dùng Auto-increment (Identity) hoặc dùng hàm băm (Hash) trường `corridor_id_source` ra số nguyên. (Khuyên dùng Hash để giữ tính Lũy đẳng).

## 4. LOADER STRATEGY (Chiến lược nạp Database)
Vì luồng này tác động đến 2 bảng có quan hệ ràng buộc, Loader phải thực thi trong **CÙNG 1 TRANSACTION (Khối Transaction duy nhất)**. Bắt buộc tuân thủ luồng sau:

### Bước 1: UPSERT `dim_corridor`
- **Khóa xung đột (Conflict Target):** `corridor_id_source` (hoặc `corridor_key` nếu tự tạo).
- **Hành động (DO UPDATE):** Cập nhật `corridor_name`, `direction`, `is_active`.
- **Trả về:** Lấy được danh sách `corridor_key` nội bộ trong Database.

### Bước 2: Nạp `bridge_corridor_segment`
Để xử lý trường hợp một tuyến đường bị thay đổi cấu trúc (cắt bỏ hoặc thêm đoạn mới), phương pháp tối ưu nhất là **Xóa & Thêm mới (Delete-and-Insert)** thay vì Upsert:
1. `DELETE FROM bridge_corridor_segment WHERE corridor_key IN (danh sách các key vừa upsert ở Bước 1)`.
2. `INSERT` hàng loạt (Bulk Insert) các bản ghi `(corridor_key, segment_key, sequence_order)` mới vào bảng bridge thông qua `session.execute(insert_stmt, bridge_records)`.

## 5. SEED DATA EXAMPLE (Dữ liệu mẫu để khởi tạo)
Khi viết Loader tĩnh, hãy dùng cấu trúc mẫu này để parse:
```json
[
  {
    "corridor_name": "Trục Nam Kỳ Khởi Nghĩa (Q1)",
    "importance_level": 3,
    "target_avg_speed_kmh": 45.00,
    "total_length_m": 1250.50,
    "direction": "Inbound",
    "is_active": true,
    "segments": [
      {"segment_id_source": 817909615, "sequence_order": 1},
      {"segment_id_source": 817909616, "sequence_order": 2},
      {"segment_id_source": 817909617, "sequence_order": 3}
    ]
  }
]