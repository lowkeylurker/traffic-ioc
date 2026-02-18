import os
import osmnx as ox
import pandas as pd
from datetime import datetime

# Cấu hình
PLACE_NAME = "District 1, Ho Chi Minh City, Vietnam"
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(_RESULT_DIR, "OSM_DATA_REPORT.md")

def explore_osm_data():
    print(f"🚀 Đang trích xuất dữ liệu OSM cho: {PLACE_NAME}...")
    
    try:
        # 1. Tải đồ thị
        graph = ox.graph_from_place(PLACE_NAME, network_type='drive')
        nodes, edges = ox.graph_to_gdfs(graph)

        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            # Tiêu đề chính
            f.write(f"# 🗺️ Báo cáo Dữ liệu Hạ tầng OSM - Quận 1\n\n")
            f.write(f"- **Thời gian trích xuất:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"- **Khu vực:** {PLACE_NAME}\n\n")
            f.write("---\n\n")

            # PHẦN 1: THỐNG KÊ TỔNG QUAN
            f.write("## 📊 1. Thống kê tổng quan\n")
            f.write(f"- **Tổng số nút giao (Nodes):** {len(nodes)}\n")
            f.write(f"- **Tổng số đoạn đường (Edges):** {len(edges)}\n")
            f.write(f"- **Hệ tọa độ:** WGS84 (EPSG:4326)\n\n")

            # PHẦN 2: DỮ LIỆU ĐOẠN ĐƯỜNG (EDGES)
            f.write("## 🛣️ 2. Chi tiết Đoạn đường (Edges)\n")
            f.write("Đây là dữ liệu quan trọng để cấu hình các cạnh trong `roadnet.json`.\n\n")
            
            # Chọn các cột quan trọng
            cols_to_show = ['name', 'highway', 'oneway', 'lanes', 'maxspeed', 'length']
            available_cols = [c for c in cols_to_show if c in edges.columns]
            
            # Lấy 10 dòng mẫu và chuyển sang bảng Markdown
            sample_edges = edges[available_cols].head(15).fillna("N/A")
            f.write(sample_edges.to_markdown())
            f.write("\n\n")

            # PHẦN 3: PHÂN TÍCH THUỘC TÍNH
            f.write("## 🔍 3. Phân tích thuộc tính hạ tầng\n")
            f.write("### Các loại đường (Highway types) tìm thấy:\n")
            highway_counts = edges['highway'].value_counts().to_frame()
            f.write(highway_counts.to_markdown())
            f.write("\n\n")

            # PHẦN 4: DỮ LIỆU HÌNH HỌC MẪU
            f.write("## 📐 4. Cấu trúc Hình học mẫu (Geometry)\n")
            f.write("Dùng để vẽ quỹ đạo xe di chuyển trong CityFlow:\n\n")
            
            example_geom = edges.iloc[0]
            f.write(f"- **Đường:** `{example_geom.get('name', 'N/A')}`\n")
            f.write(f"- **Loại:** `{example_geom['geometry'].geom_type}`\n")
            f.write(" - **Tọa độ các điểm (Points):**\n")
            f.write("```json\n")
            coords = list(example_geom['geometry'].coords)
            f.write(str(coords))
            f.write("\n```\n\n")

            f.write("---\n*Báo cáo được tạo tự động bởi module AI-Core UTRAFFIC.*")

        print(f"✅ Đã xuất báo cáo Markdown thành công: {OUTPUT_FILE}")

    except Exception as e:
        print(f"❌ Có lỗi xảy ra: {e}")

if __name__ == "__main__":
    explore_osm_data()