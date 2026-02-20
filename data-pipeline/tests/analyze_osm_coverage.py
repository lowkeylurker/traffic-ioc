import os
import osmnx as ox
import pandas as pd
from datetime import datetime

# Cấu hình
PLACE_NAME = "District 1, Ho Chi Minh City, Vietnam"
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(_RESULT_DIR, "OSM_COVERAGE_REPORT.md")

def analyze_coverage():
    print(f"🚀 Khởi động phân tích độ phủ dữ liệu cho: {PLACE_NAME}...")
    
    try:
        # 1. Tải dữ liệu mạng lưới đường bộ
        graph = ox.graph_from_place(PLACE_NAME, network_type='drive')
        nodes, edges = ox.graph_to_gdfs(graph)
        total_edges = len(edges)

        # 2. Danh sách các trường mục tiêu bạn yêu cầu
        target_cols = [
            'osmid', 'oneway', 'highway', 'reversed', 'length', 
            'name', 'geometry', 'lanes', 'maxspeed', 'width', 
            'access', 'junction', 'bridge'
        ]

        # 3. Phân tích độ phủ
        coverage_stats = []
        for col in target_cols:
            if col in edges.columns:
                # Đếm các giá trị không phải null và không phải chuỗi trống/N/A
                non_null_count = edges[col].dropna().count()
                coverage_pct = (non_null_count / total_edges) * 100
                status = "🟢 Tốt" if coverage_pct > 80 else "🟡 Trung bình" if coverage_pct > 30 else "🔴 Thiếu hụt"
            else:
                non_null_count = 0
                coverage_pct = 0.0
                status = "💀 Không tồn tại"
            
            coverage_stats.append({
                "Trường dữ liệu": f"`{col}`",
                "Số lượng bản ghi": non_null_count,
                "Độ phủ (%)": f"{coverage_pct:.2f}%",
                "Đánh giá": status
            })

        df_coverage = pd.DataFrame(coverage_stats)

        # 4. Xuất Báo cáo Markdown
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(f"# 📊 Báo cáo Độ phủ Dữ liệu Hạ tầng OSM - Quận 1\n\n")
            f.write(f"- **Ngày báo cáo:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"- **Tổng số đoạn đường (Edges) phân tích:** **{total_edges}**\n\n")
            f.write("---\n\n")

            f.write("## 1. Ma trận Độ phủ Thuộc tính (Coverage Matrix)\n")
            f.write("Bảng này đánh giá mức độ tin cậy của dữ liệu OSM để nạp vào các bảng `dim_way`.\n\n")
            f.write(df_coverage.to_markdown(index=False))
            f.write("\n\n")

            f.write("## 🔍 2. Phân tích chi tiết các trường quan trọng\n")
            
            # Phân tích Highway
            f.write("### 🛣️ Chân dung loại đường (`highway`)\n")
            highway_dist = edges['highway'].value_counts().head(5).to_frame()
            f.write(highway_dist.to_markdown())
            f.write("\n\n")

            # Phân tích Lanes
            if 'lanes' in edges.columns:
                f.write("### 🚦 Phân bố số làn xe (`lanes`)\n")
                f.write("> **Lưu ý:** Dữ liệu này cực kỳ quan trọng cho `default_lane_count` trong bảng `dim_way`.\n\n")
                lane_dist = edges['lanes'].value_counts().to_frame()
                f.write(lane_dist.to_markdown())
            else:
                f.write("### 🚦 Phân bố số làn xe (`lanes`): **DỮ LIỆU TRỐNG**\n")

            f.write("\n\n## 💡 Đề xuất hành động cho ETL\n")
            f.write("1. **Với các trường 🔴:** Cần sử dụng logic mặc định (Default Value) dựa trên `highway` type. Ví dụ: Nếu `highway='residential'` và `lanes` thiếu, mặc định là 2 làn.\n")
            f.write("2. **Trường `maxspeed`:** Thường xuyên thiếu trong OSM (Quận 1 thường < 10%). Cần bổ sung từ dữ liệu TomTom API.\n")
            f.write("3. **Trường `name`:** Các đoạn đường N/A cần được gán `road_key` dựa trên quan hệ không gian với các đoạn đường lân cận.\n\n")

            f.write("---\n*Báo cáo được thực hiện bởi Pipeline UTRAFFIC Intelligence.*")

        print(f"✅ Báo cáo đã được tạo: {OUTPUT_FILE}")

    except Exception as e:
        print(f"❌ Lỗi thực thi: {e}")

if __name__ == "__main__":
    analyze_coverage()