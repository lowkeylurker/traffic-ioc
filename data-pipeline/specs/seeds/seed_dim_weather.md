### 📋 COPY ĐOẠN DƯỚI ĐÂY LƯU THÀNH FILE `spec_dim_weather.md`

Markdown

```
# SEED CONTEXT: DATA SPECIFICATION FOR `dim_weather` (OPENWEATHERMAP)

**Tới AI/Copilot:** Khi bạn được yêu cầu viết Pydantic Schema, Transformer hoặc Loader cho dữ liệu thời tiết (Weather) nạp vào bảng `dim_weather`, BẠN BẮT BUỘC phải tuân thủ nghiêm ngặt các cấu trúc và quy tắc chuyển đổi dưới đây.

## 1. SOURCE DATA (Dữ liệu đầu vào từ API)
- **Nguồn:** OpenWeatherMap API (Current Weather).
- **Cấu trúc JSON thô (Raw Payload) cần lấy:**
  ```json
  {
      "weather": [
          {
              "id": 500,
              "main": "Rain",
              "description": "mưa nhẹ",
              "icon": "10d"
          }
      ],
      "dt": 1771401818
  }

```

2\. TARGET SCHEMA (Bảng `dim_weather` trong Database)
-----------------------------------------------------

Các trường (columns) cần map và nạp vào DB bao gồm:

-   `weather_key` (Integer, Primary Key)

-   `weather_id` (Integer)

-   `name` (String / VARCHAR)

-   `main_category` (String / VARCHAR)

-   `severity_level` (SmallInt / Integer)

-   `record_timestamp` (DateTime / Timestamp)

3\. MAPPING & TRANSFORM RULES (Quy tắc biến đổi - Pure Functions)
-----------------------------------------------------------------

### A. Ánh xạ trực tiếp (Direct Mapping)

-   `weather[0].id` -> Map sang `weather_key` VÀ `weather_id`.

-   `weather[0].main` -> Map sang `main_category`.


-   `dt` (Unix Timestamp) -> Biến đổi thành đối tượng `datetime` UTC và map sang `record_timestamp`.

### B. Quy tắc rẽ nhánh tính Mức độ ảnh hưởng (`severity_level`)

BẮT BUỘC viết hàm transform `get_severity_level(weather_id: int) -> int` dựa trên các khoảng ID sau:

-   **Nhóm 4 (Dông bão - Nguy hiểm):** `200 <= weather_id <= 299` -> Trả về `4`

-   **Nhóm 2 (Mưa phùn - Ảnh hưởng vừa):** `300 <= weather_id <= 399` -> Trả về `2`

-   **Nhóm 3 (Mưa rào/Tuyết - Ảnh hưởng lớn):** `500 <= weather_id <= 699` -> Trả về `3`

-   **Nhóm 1 (Sương mù/Khói - Ảnh hưởng tầm nhìn):** `700 <= weather_id <= 799` -> Trả về `1`

-   **Nhóm 0 (Trời quang/Có mây - Không ảnh hưởng):** `800 <= weather_id <= 899` -> Trả về `0`

-   **Ngoại lệ (Fallback):** Mọi ID khác không nằm trong khoảng trên -> Trả về `0`.

4\. LOADER STRATEGY (Chiến lược nạp Database)
---------------------------------------------

-   **Loại bảng:** Bảng Dimension (Danh mục tĩnh).

-   **Cơ chế UPSERT bằng SQLAlchemy (`postgresql.insert`):**

    -   **Khóa xung đột (Conflict Target):** `weather_key`

    -   **Hành động (Action):** `ON CONFLICT DO UPDATE`.

    -   **Trường cập nhật (Set):** Cập nhật `main_category`, `description_vi`, `severity_level` và `record_timestamp` (để biết lần cuối API trả về mã này là khi nào).

-   **Tối ưu:** Dữ liệu vào Loader phải là một `list[dict]`. Sử dụng `session.execute(insert_stmt, records)`.

5\. SEED DATA (Dữ liệu danh mục chuẩn cần khởi tạo)
---------------------------------------------------

Hệ thống sử dụng các mã thời tiết đặc thù cho khí hậu TP.HCM. Nếu cần viết script khởi tạo seed data, hãy tham chiếu danh sách các ID sau:

-   Mức 0: 800, 801, 802, 803, 804.

-   Mức 1: 701, 721, 741.

-   Mức 2: 300, 301, 310.

-   Mức 3: 500, 501, 502, 503, 504, 521.

-   Mức 4: 200, 201, 202, 211, 212.

-   Mã mặc định: 999.