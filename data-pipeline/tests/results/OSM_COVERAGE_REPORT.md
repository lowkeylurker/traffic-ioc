# 📊 Báo cáo Độ phủ Dữ liệu Hạ tầng OSM - Quận 1

- **Ngày báo cáo:** 2026-02-19 06:55:31
- **Tổng số đoạn đường (Edges) phân tích:** **2081**

---

## 1. Ma trận Độ phủ Thuộc tính (Coverage Matrix)
Bảng này đánh giá mức độ tin cậy của dữ liệu OSM để nạp vào các bảng `dim_way`.

| Trường dữ liệu   |   Số lượng bản ghi | Độ phủ (%)   | Đánh giá     |
|:-----------------|-------------------:|:-------------|:-------------|
| `osmid`          |               2081 | 100.00%      | 🟢 Tốt        |
| `oneway`         |               2081 | 100.00%      | 🟢 Tốt        |V
| `highway`        |               2081 | 100.00%      | 🟢 Tốt        |
| `reversed`       |               2081 | 100.00%      | 🟢 Tốt        |
| `length`         |               2081 | 100.00%      | 🟢 Tốt        |
| `name`           |               1758 | 84.48%       | 🟢 Tốt        |
| `geometry`       |               2081 | 100.00%      | 🟢 Tốt        |
| `lanes`          |               1218 | 58.53%       | 🟡 Trung bình |
| `maxspeed`       |                624 | 29.99%       | 🔴 Thiếu hụt  |
| `width`          |                 13 | 0.62%        | 🔴 Thiếu hụt  |
| `access`         |                 10 | 0.48%        | 🔴 Thiếu hụt  |
| `junction`       |                 34 | 1.63%        | 🔴 Thiếu hụt  |
| `bridge`         |                 10 | 0.48%        | 🔴 Thiếu hụt  |

## 🔍 2. Phân tích chi tiết các trường quan trọng
### 🛣️ Chân dung loại đường (`highway`)
| highway      |   count |
|:-------------|--------:|
| residential  |     710 |
| primary      |     496 |
| tertiary     |     426 |
| secondary    |     202 |
| primary_link |     185 |

### 🚦 Phân bố số làn xe (`lanes`)
> **Lưu ý:** Dữ liệu này cực kỳ quan trọng cho `default_lane_count` trong bảng `dim_way`.

| lanes           |   count |
|:----------------|--------:|
| 2               |     751 |
| 3               |     260 |
| 1               |     113 |
| 4               |      67 |
| 5               |       7 |
| 6               |       6 |
| ['3', '2']      |       4 |
| ['3', '4']      |       3 |
| ['1', '2']      |       3 |
| ['2', '4']      |       1 |
| ['3', '2', '4'] |       1 |
| ['3', '2', '5'] |       1 |
| ['3', '1']      |       1 |

## 💡 Đề xuất hành động cho ETL
1. **Với các trường 🔴:** Cần sử dụng logic mặc định (Default Value) dựa trên `highway` type. Ví dụ: Nếu `highway='residential'` và `lanes` thiếu, mặc định là 2 làn.
2. **Trường `maxspeed`:** Thường xuyên thiếu trong OSM (Quận 1 thường < 10%). Cần bổ sung từ dữ liệu TomTom API.
3. **Trường `name`:** Các đoạn đường N/A cần được gán `road_key` dựa trên quan hệ không gian với các đoạn đường lân cận.

---
*Báo cáo được thực hiện bởi Pipeline UTRAFFIC Intelligence.*