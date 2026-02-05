# 🗺️ Báo cáo Dữ liệu Hạ tầng OSM - Quận 1

- **Thời gian trích xuất:** 2026-02-05 13:07:44
- **Khu vực:** District 1, Ho Chi Minh City, Vietnam

---

## 📊 1. Thống kê tổng quan
- **Tổng số nút giao (Nodes):** 986
- **Tổng số đoạn đường (Edges):** 2077
- **Hệ tọa độ:** WGS84 (EPSG:4326)

## 🛣️ 2. Chi tiết Đoạn đường (Edges)
Đây là dữ liệu quan trọng để cấu hình các cạnh trong `roadnet.json`.

|                             | name              | highway      | oneway   | lanes   | maxspeed   |   length |
|:----------------------------|:------------------|:-------------|:---------|:--------|:-----------|---------:|
| (366440881, 6637081019, 0)  | N/A               | tertiary     | False    | N/A     | N/A        |  10.6113 |
| (366440881, 411925963, 0)   | Đinh Tiên Hoàng   | primary      | True     | N/A     | N/A        |  94.1156 |
| (366440881, 11064388833, 0) | Trần Quang Khải   | tertiary     | False    | N/A     | N/A        |  10.305  |
| (411917818, 411917819, 0)   | Trần Quý Khoách   | residential  | False    | N/A     | N/A        |  79.8163 |
| (411917819, 411926202, 0)   | Trần Nhật Duật    | residential  | False    | N/A     | N/A        |  56.7722 |
| (411917819, 411918807, 0)   | Trần Nhật Duật    | residential  | False    | N/A     | N/A        |  62.5089 |
| (411917819, 411917818, 0)   | Trần Quý Khoách   | residential  | False    | N/A     | N/A        |  79.8163 |
| (411917819, 411926237, 0)   | Trần Quý Khoách   | residential  | False    | 2       | N/A        | 242.374  |
| (411917825, 411926232, 0)   | Đặng Dung         | residential  | False    | N/A     | N/A        | 180.548  |
| (411917825, 411926241, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        | 106.689  |
| (411917825, 411917828, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |  65.4097 |
| (411917828, 2332682129, 0)  | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |  17.393  |
| (411917828, 411926202, 0)   | Ðặng Tất          | residential  | False    | N/A     | N/A        | 213.12   |
| (411917828, 411917825, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |  65.4097 |
| (411917836, 9404297255, 0)  | N/A               | primary_link | False    | N/A     | N/A        |  10.9204 |

## 🔍 3. Phân tích thuộc tính hạ tầng
### Các loại đường (Highway types) tìm thấy:
| highway                         |   count |
|:--------------------------------|--------:|
| residential                     |     708 |
| primary                         |     496 |
| tertiary                        |     424 |
| secondary                       |     202 |
| primary_link                    |     185 |
| trunk                           |      18 |
| tertiary_link                   |      16 |
| secondary_link                  |       7 |
| ['residential', 'primary_link'] |       6 |
| trunk_link                      |       6 |
| living_street                   |       6 |
| ['tertiary', 'primary_link']    |       2 |
| ['primary', 'residential']      |       1 |

## 📐 4. Cấu trúc Hình học mẫu (Geometry)
Dùng để vẽ quỹ đạo xe di chuyển trong CityFlow:

- **Đường:** `nan`
- **Loại:** `LineString`
 - **Tọa độ các điểm (Points):**
```json
[(106.6958961, 10.7926816), (106.6959923, 10.7926949)]
```

---
*Báo cáo được tạo tự động bởi module AI-Core UTRAFFIC.*