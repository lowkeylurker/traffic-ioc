# 🗺️ Báo cáo Dữ liệu Hạ tầng OSM - Quận 1

- **Thời gian trích xuất:** 2026-02-19 06:46:38
- **Khu vực:** District 1, Ho Chi Minh City, Vietnam

---

## 📊 1. Thống kê tổng quan
- **Tổng số nút giao (Nodes):** 987
- **Tổng số đoạn đường (Edges):** 2081
- **Hệ tọa độ:** WGS84 (EPSG:4326)

## 🛣️ 2. Chi tiết Đoạn đường (Edges)
Đây là dữ liệu quan trọng để cấu hình các cạnh trong `roadnet.json`.

|     osmid |       y |       x |   street_count |   highway |   ref | geometry                       |
|----------:|--------:|--------:|---------------:|----------:|------:|:-------------------------------|
| 366440881 | 10.7927 | 106.696 |              4 |       nan |   nan | POINT (106.6958961 10.7926816) |
| 411917818 | 10.7937 | 106.69  |              1 |       nan |   nan | POINT (106.6902628 10.7936866) |
| 411917819 | 10.7936 | 106.69  |              4 |       nan |   nan | POINT (106.689543 10.7935629)  |
| 411917825 | 10.7923 | 106.688 |              3 |       nan |   nan | POINT (106.6880823 10.7922967) |
| 411917828 | 10.7927 | 106.688 |              3 |       nan |   nan | POINT (106.6877013 10.7927487) |

|                             |      osmid | oneway   | highway     | reversed   |   length | name            | geometry                                                                                                                            |   lanes |   maxspeed |   width |   access |   junction |   bridge |
|:----------------------------|-----------:|:---------|:------------|:-----------|---------:|:----------------|:------------------------------------------------------------------------------------------------------------------------------------|--------:|-----------:|--------:|---------:|-----------:|---------:|
| (366440881, 6637081019, 0)  |  817909613 | False    | tertiary    | True       |   10.611 | nan             | LINESTRING (106.6958961 10.7926816, 106.6959923 10.7926949)                                                                         |     nan |        nan |     nan |      nan |        nan |      nan |
| (366440881, 411925963, 0)   |  817909615 | True     | primary     | False      |   94.116 | Đinh Tiên Hoàng | LINESTRING (106.6958961 10.7926816, 106.6958881 10.7925668, 106.6958845 10.7925055, 106.6958674 10.7919705, 106.6958631 10.7918359) |     nan |        nan |     nan |      nan |        nan |      nan |
| (366440881, 11064388833, 0) | 1191732961 | False    | tertiary    | True       |   10.305 | Trần Quang Khải | LINESTRING (106.6958961 10.7926816, 106.6958498 10.792673, 106.695803 10.7926668)                                                   |     nan |        nan |     nan |      nan |        nan |      nan |
| (411917818, 411917819, 0)   | 1177476980 | False    | residential | False      |   79.816 | Trần Quý Khoách | LINESTRING (106.6902628 10.7936866, 106.689543 10.7935629)                                                                          |     nan |        nan |     nan |      nan |        nan |      nan |
| (411917819, 411926202, 0)   |   35115272 | False    | residential | True       |   56.772 | Trần Nhật Duật  | LINESTRING (106.689543 10.7935629, 106.6896267 10.793059)                                                                           |     nan |        nan |     nan |      nan |        nan |      nan |

|                             | name              | highway      | oneway   | lanes   | maxspeed   |   length |
|:----------------------------|:------------------|:-------------|:---------|:--------|:-----------|---------:|
| (366440881, 6637081019, 0)  | N/A               | tertiary     | False    | N/A     | N/A        |   10.611 |
| (366440881, 411925963, 0)   | Đinh Tiên Hoàng   | primary      | True     | N/A     | N/A        |   94.116 |
| (366440881, 11064388833, 0) | Trần Quang Khải   | tertiary     | False    | N/A     | N/A        |   10.305 |
| (411917818, 411917819, 0)   | Trần Quý Khoách   | residential  | False    | N/A     | N/A        |   79.816 |
| (411917819, 411926202, 0)   | Trần Nhật Duật    | residential  | False    | N/A     | N/A        |   56.772 |
| (411917819, 411918807, 0)   | Trần Nhật Duật    | residential  | False    | N/A     | N/A        |   62.509 |
| (411917819, 411917818, 0)   | Trần Quý Khoách   | residential  | False    | N/A     | N/A        |   79.816 |
| (411917819, 411926237, 0)   | Trần Quý Khoách   | residential  | False    | 2       | N/A        |  242.373 |
| (411917825, 411926232, 0)   | Đặng Dung         | residential  | False    | N/A     | N/A        |  180.548 |
| (411917825, 411926241, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |  106.689 |
| (411917825, 411917828, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |   65.409 |
| (411917828, 2332682129, 0)  | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |   17.393 |
| (411917828, 411926202, 0)   | Ðặng Tất          | residential  | False    | N/A     | N/A        |  213.12  |
| (411917828, 411917825, 0)   | Nguyễn Văn Nguyễn | residential  | False    | N/A     | N/A        |   65.409 |
| (411917836, 9404297255, 0)  | N/A               | primary_link | False    | N/A     | N/A        |   10.92  |

## 🔍 3. Phân tích thuộc tính hạ tầng
### Các loại đường (Highway types) tìm thấy:
| highway                         |   count |
|:--------------------------------|--------:|
| residential                     |     710 |
| primary                         |     496 |
| tertiary                        |     426 |
| secondary                       |     202 |
| primary_link                    |     185 |
| trunk                           |      18 |
| tertiary_link                   |      16 |
| secondary_link                  |       7 |
| ['primary_link', 'residential'] |       6 |
| trunk_link                      |       6 |
| living_street                   |       6 |
| ['primary_link', 'tertiary']    |       2 |
| ['residential', 'primary']      |       1 |

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