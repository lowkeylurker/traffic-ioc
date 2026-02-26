import requests
import pandas as pd
from datetime import datetime
import os

# Bounding Box Quận 1 (minLat, minLon, maxLat, maxLon)
BBOX = "10.743,106.663,10.803,106.723"
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
REPORT_FILE = os.path.join(_RESULT_DIR, "OSM_ARTERIAL_ROADS_REPORT.md")

def get_arterial_roads():
    print("🌐 Đang truy vấn dữ liệu huyết mạch từ Overpass API...")
    
    # Overpass QL: Lấy các đường cao tốc, trục chính và đường cấp 1, 2
    query = f"""
    [out:json][timeout:25];
    (
      way["highway"~"trunk|primary|secondary"]({BBOX});
    );
    out body;
    >;
    out skel qt;
    """
    
    url = "https://overpass-api.de/api/interpreter"
    
    try:
        response = requests.post(url, data={'data': query})
        response.raise_for_status()
        data = response.json()
        
        elements = data.get('elements', [])
        roads = []
        
        for el in elements:
            if el.get('type') == 'way':
                tags = el.get('tags', {})
                roads.append({
                    "OSM_ID": el.get('id'),
                    "Name": tags.get('name', 'Không tên'),
                    "Type": tags.get('highway'),
                    "Lanes": tags.get('lanes', 'N/A'),
                    "MaxSpeed": tags.get('maxspeed', 'N/A'),
                    "OneWay": tags.get('oneway', 'no')
                })
        
        df = pd.DataFrame(roads)
        # Loại bỏ các đoạn trùng tên để tạo danh sách Corridor tiềm năng
        df_summary = df.groupby(['Name', 'Type']).agg({
            'OSM_ID': 'count',
            'Lanes': 'first'
        }).reset_index().rename(columns={'OSM_ID': 'Segment_Count'})
        
        generate_report(df_summary)
        
    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu: {e}")

def generate_report(df):
    report_file = REPORT_FILE
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("# 🛣️ Báo cáo Tuyến đường Huyết mạch Quận 1 (OSM Data)\n\n")
        f.write(f"- **Ngày trích xuất:** {datetime.now().strftime('%Y-%m-%d')}\n")
        f.write("- **Nguồn dữ liệu:** OpenStreetMap via Overpass API\n")
        f.write(f"- **Tổng số tuyến đường huyết mạch tìm thấy:** {len(df)}\n\n")
        
        f.write("## 1. Phân loại theo cấp độ hạ tầng\n")
        f.write("> Dữ liệu này giúp xác định các `Corridor` ưu tiên trong hệ thống TIOC.\n\n")
        type_counts = df['Type'].value_counts().to_frame()
        f.write(type_counts.to_markdown())
        f.write("\n\n")
        
        f.write("## 2. Danh sách các trục đường quan trọng (Mẫu cho dim_corridor)\n")
        f.write("| Tên đường | Loại (OSM Tag) | Số đoạn (Segments) | Ghi chú |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        for _, row in df.sort_values(by='Segment_Count', ascending=False).head(20).iterrows():
            f.write(f"| {row['Name']} | {row['Type']} | {row['Segment_Count']} | Ứng viên cho Corridor |\n")
            
        f.write("\n\n---\n*Dữ liệu phục vụ việc thiết kế bảng dim_corridor và map_corridor_segment.*")
    
    print(f"✅ Đã tạo báo cáo: {report_file}")

if __name__ == "__main__":
    get_arterial_roads()