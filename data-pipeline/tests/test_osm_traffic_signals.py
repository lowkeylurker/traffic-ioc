import osmnx as ox
import pandas as pd
from datetime import datetime
import os

_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(_RESULT_DIR, "Traffic_Signals_Report.md")

def generate_traffic_signals_report():
    # 1. Cấu hình khu vực và nhãn cần tìm
    place_name = "District 1, Ho Chi Minh City, Vietnam"
    tags = {"highway": "traffic_signals"}
    
    print(f"--- Đang trích xuất dữ liệu từ OSM cho: {place_name} ---")
    
    try:
        # 2. Lấy dữ liệu dạng Features (Points) từ OSM
        gdf = ox.features_from_place(place_name, tags)
        
        # 3. Xử lý dữ liệu
        # Reset index để đưa osmid thành một cột bình thường
        gdf = gdf.reset_index()
        
        # Lấy tọa độ Lat/Lon từ cột geometry
        gdf['latitude'] = gdf.geometry.y
        gdf['longitude'] = gdf.geometry.x
        
        # Chọn các cột quan trọng cho dim_node
        columns_to_keep = ['osmid', 'latitude', 'longitude', 'highway']
        # Thêm các cột bổ sung nếu tồn tại trong dữ liệu OSM
        optional_tags = ['crossing', 'direction', 'traffic_signals:direction']
        for tag in optional_tags:
            if tag in gdf.columns:
                columns_to_keep.append(tag)
        
        report_df = gdf[columns_to_keep].copy()
        total_signals = len(report_df)
        
        # 4. Tạo nội dung Markdown
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        md_content = f"""# 🚦 Báo cáo Đèn tín hiệu Giao thông (OSM Nodes) - Quận 1

- **Ngày trích xuất:** {now}
- **Khu vực:** {place_name}
- **Tổng số nút có đèn tín hiệu tìm thấy:** **{total_signals}**

---

## 1. Thống kê chi tiết
Dữ liệu này phục vụ việc xác định `node_type = 'signalized'` trong bảng `dim_node`.

| STT | OSM ID | Latitude | Longitude | Loại nhãn | Ghi chú |
|:--- |:--- |:--- |:--- |:--- |:--- |
"""
        # Thêm bảng dữ liệu (lấy 20 dòng mẫu hoặc toàn bộ)
        for i, row in report_df.iterrows():
            crossing = row.get('crossing', 'N/A')
            md_content += f"| {i+1} | {row['osmid']} | {row['latitude']:.6f} | {row['longitude']:.6f} | {row['highway']} | Crossing: {crossing} |\n"

        md_content += """
---
## 🔍 2. Hướng dẫn cho ETL
1. **Trùng lặp:** Nếu nhiều Node đèn tín hiệu nằm quá sát nhau (<10m), hãy dùng DBSCAN để gom nhóm vào cùng một `intersection_id`.
2. **Khởi tạo:** Mọi bản ghi trong báo cáo này mặc định gán `node_type = 'signalized'`.
3. **Mã đèn:** `osmid` của node có thể dùng làm tiền đề để tạo `traffic_light_id`.

*Báo cáo được tạo bởi Script tự động của Novi - MLE Student.*
"""
        
        # 5. Xuất file
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(md_content)
            
        print(f"--- Thành công! Đã tạo file {OUTPUT_FILE} với {total_signals} điểm đèn tín hiệu. ---")

    except Exception as e:
        print(f"Lỗi khi trích xuất: {e}")

if __name__ == "__main__":
    generate_traffic_signals_report()