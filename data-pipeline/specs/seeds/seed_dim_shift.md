# SEED CONTEXT: DATA SPECIFICATION FOR `dim_shift` (TRAFFIC SHIFTS / TIME PERIODS)

**Tới AI/Copilot:** Khi bạn được yêu cầu viết Pydantic Schema, Transformer hoặc Loader cho dữ liệu khung giờ nạp vào bảng `dim_shift`, BẠN BẮT BUỘC phải tuân thủ nghiêm ngặt các cấu trúc và quy tắc phân loại dưới đây. Đây là danh mục tĩnh (Static Dimension) dựa trên đặc thù giao thông TP.HCM.

## 1. SOURCE DATA (Dữ liệu đầu vào)
- **Nguồn:** Không lấy từ API bên ngoài. Dữ liệu này được tạo tĩnh (Static Generation) dựa trên cấu hình hệ thống hoặc được Transform từ cột thời gian (`timestamp` / `hour`) của các bản ghi sự kiện (Fact).
- **Tham số đầu vào để nội suy:** `hour_of_day` (Số nguyên từ `0` đến `23`).

## 2. TARGET SCHEMA (Bảng `dim_shift` trong Database)
Các trường (columns) cần map và nạp vào DB bao gồm:
- `shift_key` (Integer, Primary Key) - Mã ID của ca/khung giờ.
- `shift_code` (String / VARCHAR) - Mã code của ca/khung giờ trong hệ thống.
- `shift_name_vi` (String / VARCHAR) - Tên ca giao thông (Tiếng Việt).
- `start_hour` (Integer) - Giờ bắt đầu (0-23).
- `end_hour` (Integer) - Giờ kết thúc (0-23).
- `is_business_shift` (Boolean) - Cờ đánh dấu có phải ca/khung giờ cao điểm hay không (True/False).

## 3. MAPPING & TRANSFORM RULES (Quy tắc biến đổi - Pure Functions)

BẮT BUỘC viết hàm transform `get_shift_info(hour_of_day: int) -> dict` dựa trên sự phân bổ "nhịp sinh học" giao thông sau:

### A. Quy tắc rẽ nhánh (Dựa trên `hour_of_day`)
- **Ban đêm (Night):** `22 <= hour_of_day <= 23` HOẶC `0 <= hour_of_day <= 5`
  -> Trả về `shift_key=1`, `is_peak_hour=False`
- **Sáng sớm (Early Morning):** `hour_of_day == 6`
  -> Trả về `shift_key=2`, `is_peak_hour=False`
- **Cao điểm sáng (Morning Peak):** `7 <= hour_of_day <= 9`
  -> Trả về `shift_key=3`, `is_peak_hour=True`
- **Bình thường ban ngày (Daytime Off-peak):** `10 <= hour_of_day <= 16`
  -> Trả về `shift_key=4`, `is_peak_hour=False`
- **Cao điểm chiều (Evening Peak):** `17 <= hour_of_day <= 19`
  -> Trả về `shift_key=5`, `is_peak_hour=True`
- **Buổi tối (Evening):** `20 <= hour_of_day <= 21`
  -> Trả về `shift_key=6`, `is_peak_hour=False`

*Lưu ý: Nếu input `hour_of_day` không hợp lệ (<0 hoặc >23), trả về mã lỗi hoặc mặc định (VD: `shift_key=99`).*

## 4. LOADER STRATEGY (Chiến lược nạp Database)
- **Loại luồng:** Đây là luồng tạo dữ liệu tĩnh (Static Pipeline), thường chạy 1 lần lúc khởi tạo hệ thống (Init DB).
- **Cơ chế UPSERT bằng SQLAlchemy (`postgresql.insert`):**
  - **Khóa xung đột (Conflict Target):** `shift_key`
  - **Hành động (Action):** `ON CONFLICT DO UPDATE`. 
  - **Trường cập nhật (Set):** Cập nhật `shift_code`, `shift_name_vi`, `start_hour`, `end_hour`, `is_peak_hour`.

## 5. SEED DATA (Dữ liệu danh mục chuẩn cần khởi tạo)
Khi viết script Loader tĩnh, hãy sử dụng chính xác danh sách các Dictionary sau làm nguồn dữ liệu nạp (Records):

```python
STATIC_SHIFTS = [
    {"shift_key": 1, "shift_code": "NIGHT", "shift_name_vi": "Ban đêm", "shift_name_en": "Night", "start_hour": 22, "end_hour": 5, "is_peak_hour": False},
    {"shift_key": 2, "shift_code": "EARLY_MORNING", "shift_name_vi": "Sáng sớm", "shift_name_en": "Early Morning", "start_hour": 6, "end_hour": 6, "is_peak_hour": False},
    {"shift_key": 3, "shift_code": "MORNING_PEAK", "shift_name_vi": "Cao điểm sáng", "shift_name_en": "Morning Peak", "start_hour": 7, "end_hour": 9, "is_peak_hour": True},
    {"shift_key": 4, "shift_code": "DAYTIME_OFFPEAK", "shift_name_vi": "Bình thường ngày", "shift_name_en": "Daytime Off-peak", "start_hour": 10, "end_hour": 16, "is_peak_hour": False},
    {"shift_key": 5, "shift_code": "EVENING_PEAK", "shift_name_vi": "Cao điểm chiều", "shift_name_en": "Evening Peak", "start_hour": 17, "end_hour": 19, "is_peak_hour": True},
    {"shift_key": 6, "shift_code": "EVENING", "shift_name_vi": "Buổi tối", "shift_name_en": "Evening", "start_hour": 20, "end_hour": 21, "is_peak_hour": False},
    {"shift_key": 99, "shift_code": "UNKNOWN", "shift_name_vi": "Không xác định", "shift_name_en": "Unknown", "start_hour": -1, "end_hour": -1, "is_peak_hour": False}
]