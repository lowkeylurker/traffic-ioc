import os
import requests
import pandas as pd
from datetime import datetime
import dotenv
import json

dotenv.load_dotenv()
# --- CẤU HÌNH API V5 ---
API_KEY = os.getenv("TOMTOM_API_KEY")
VERSION = 5

# Tọa độ BBox Quận 1 (minLon, minLat, maxLon, maxLat) theo chuẩn API v5
# Chú ý: API v5 yêu cầu Longitude đứng trước 
BBOX = "106.663,10.743,106.723,10.803" 

# Endpoint v5 (Sử dụng cấu trúc Query Parameters thay vì Path Parameters cũ)
URL = f"https://api.tomtom.com/traffic/services/{VERSION}/incidentDetails"

PARAMS = {
    "key": API_KEY,
    "bbox": BBOX,
    # Yêu cầu rõ ràng các trường thuộc tính lồng nhau
    "t": "-1",
    "timeValidityFilter": "present,future"
}

_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(_RESULT_DIR, "TOMTOM_INCIDENT_ANALYZE_REPORT.md")

def fetch_and_analyze_v5():
    print(f"🚀 Đang kết nối TomTom API v5 - Khu vực Quận 1...")
    
    try:
        response = requests.get(URL, params=PARAMS)
        response.raise_for_status()
        data = response.json()
        
        incidents = data.get("incidents", [])
        if not incidents:
            print("⚠️ Không có sự cố nào được ghi nhận tại Quận 1 lúc này.")
            return
        
        # Phân tích dữ liệu theo cấu trúc v5
        report_data = []
        for inc in incidents:
            props = inc['properties']
            geom = inc['geometry']
            report_data.append({
                "ID": props.get("id"),
                "Loại (Icon)": props.get("iconCategory"),
                "Mức độ": props.get("magnitudeOfDelay"),
                "Độ trễ (s)": props.get("delayInSeconds"),
                "Chiều dài (m)": props.get("lengthInMeters"),
                "Mô tả": props.get("events", [{}])[0].get("description", "N/A"),
                "Vị trí": f"{geom['coordinates'][1]}, {geom['coordinates'][0]}" # Lat, Lon
            })

        df = pd.DataFrame(report_data)
        generate_markdown_report(df)

    except requests.exceptions.HTTPError as err:
        print(f"❌ Lỗi API v5: {err.response.text}")
    except Exception as e:
        print(f"❌ Lỗi hệ thống: {e}")

def generate_markdown_report(df):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("# 🚦 Báo cáo Phân tích Incident API v5 - UTRAFFIC\n\n")
        f.write(f"- **Phiên bản API:** TomTom Incident Details v5 (Latest) \n")
        f.write(f"- **Thời gian thực hiện:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"- **Phạm vi (BBox):** {BBOX} (District 1) \n")
        f.write(f"- **Số lượng sự cố:** **{len(df)}**\n\n")
        f.write("---\n\n")

        # f.write("\n📋 Sample Incident (formatted):\n")
        # f.write(json.dumps(incidents[0], indent=2, ensure_ascii=False))
        # f.write("\n" + "="*80 + "\n")  

        # Phân tích mức độ ảnh hưởng (Nghiệp vụ B3)
        f.write("## 1. Mức độ nghiêm trọng (`magnitudeOfDelay`)\n")
        f.write("> Dữ liệu này trực tiếp tác động đến `severity_level` trong `fact_incident`[cite: 73, 88].\n\n")
        severity_dist = df['Mức độ'].value_counts().to_frame()
        f.write(severity_dist.to_markdown())
        f.write("\n\n")

        # Thống kê kỹ thuật (Nghiệp vụ A1)
        f.write("## 2. Thống kê kỹ thuật dòng chảy\n")
        stats = df[['Độ trễ (s)', 'Chiều dài (m)']].describe().round(2)
        f.write(stats.to_markdown())
        f.write("\n\n")

        # Dữ liệu chi tiết cho ETL
        f.write("## 📥 3. Dữ liệu mẫu phục vụ nạp Kho (DW)\n")
        f.write(df.head(10).to_markdown(index=False))
        f.write("\n\n---\n*Báo cáo được thực hiện tự động bởi Pipeline TIOC Quận 1.*")

    print(f"✅ Đã xuất báo cáo v5 thành công: {OUTPUT_FILE}")

if __name__ == "__main__":
    fetch_and_analyze_v5()