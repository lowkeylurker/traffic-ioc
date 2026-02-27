# 🛣️ Báo cáo Tuyến đường Huyết mạch Quận 1 (OSM Data)

- **Ngày trích xuất:** 2026-02-23
- **Nguồn dữ liệu:** OpenStreetMap via Overpass API
- **Tổng số tuyến đường huyết mạch tìm thấy:** 245

## 1. Phân loại theo cấp độ hạ tầng
> Dữ liệu này giúp xác định các `Corridor` ưu tiên trong hệ thống TIOC.

| Type           |   count |
|:---------------|--------:|
| primary        |     103 |
| secondary      |      85 |
| primary_link   |      31 |
| trunk          |      11 |
| secondary_link |       9 |
| trunk_link     |       6 |

## 2. Danh sách các trục đường quan trọng (Mẫu cho dim_corridor)
| Tên đường | Loại (OSM Tag) | Số đoạn (Segments) | Ghi chú |
| :--- | :--- | :--- | :--- |
| Không tên | primary_link | 186 | Ứng viên cho Corridor |
| Điện Biên Phủ | primary | 69 | Ứng viên cho Corridor |
| Trần Hưng Đạo | primary | 66 | Ứng viên cho Corridor |
| Đường Võ Văn Kiệt | trunk | 60 | Ứng viên cho Corridor |
| Đường Võ Văn Kiệt | primary | 57 | Ứng viên cho Corridor |
| Nguyễn Thị Minh Khai | primary | 52 | Ứng viên cho Corridor |
| Cách Mạng Tháng 8 | primary | 50 | Ứng viên cho Corridor |
| Đường 3 Tháng 2 | primary | 47 | Ứng viên cho Corridor |
| Bến Vân Đồn | secondary | 44 | Ứng viên cho Corridor |
| Nguyễn Hữu Cảnh | primary | 40 | Ứng viên cho Corridor |
| Hai Bà Trưng | primary | 34 | Ứng viên cho Corridor |
| Không tên | secondary_link | 33 | Ứng viên cho Corridor |
| Không tên | primary | 32 | Ứng viên cho Corridor |
| Điện Biên Phủ | trunk | 30 | Ứng viên cho Corridor |
| Nguyễn Thái Học | primary | 30 | Ứng viên cho Corridor |
| Nguyễn Tri Phương | primary | 29 | Ứng viên cho Corridor |
| Đường Nguyễn Văn Cừ | primary | 28 | Ứng viên cho Corridor |
| Nguyễn Tất Thành | primary | 28 | Ứng viên cho Corridor |
| Tôn Đức Thắng | primary | 26 | Ứng viên cho Corridor |
| Võ Văn Kiệt | primary | 26 | Ứng viên cho Corridor |


---
*Dữ liệu phục vụ việc thiết kế bảng dim_corridor và map_corridor_segment.*