import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

# Load cấu hình từ file .env
load_dotenv()
API_KEY = os.getenv("TOMTOM_API_KEY")
BASE_URL = "https://api.tomtom.com"
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "result")
os.makedirs(_RESULT_DIR, exist_ok=True)
REPORT_FILE = os.path.join(_RESULT_DIR, "TOMTOM_TECHNICAL_REPORT.md")

class TomTomAudit:
    def __init__(self, api_key):
        self.key = api_key
        # Khởi tạo file báo cáo với tiêu đề chuẩn đồ án
        with open(REPORT_FILE, "w", encoding="utf-8") as f:
            f.write(f"# 📊 BÁO CÁO THỬ NGHIỆM KẾT NỐI TOMTOM API - UTRAFFIC\n\n")
            f.write(f"- **Ngày thực hiện:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"- **Mục tiêu:** Kiểm tra cấu trúc dữ liệu đầu vào cho Kho dữ liệu (DW) và Engine CityFlow.\n\n")
            f.write("---\n\n")

    def _write_section(self, title, description, raw_data):
        """Hàm hỗ trợ ghi nội dung vào file Markdown"""
        with open(REPORT_FILE, "a", encoding="utf-8") as f:
            f.write(f"## {title}\n")
            f.write(f"**Mô tả:** {description}\n\n")
            f.write("### 📥 Dữ liệu phản hồi (JSON):\n")
            f.write("```json\n")
            f.write(json.dumps(raw_data, indent=4, ensure_ascii=False))
            f.write("\n```\n")
            f.write("\n---\n\n")
        print(f"✅ Đã lưu kết quả: {title}")

    # 1. Search & Geocoding
    def test_search_geocoding(self, address):
        url = f"{BASE_URL}/search/2/geocode/{address}.json"
        params = {"key": self.key, "limit": 1, "countrySet": "VN"}
        res = requests.get(url, params=params).json()
        desc = "Chuyển địa chỉ từ báo cáo của người dân sang tọa độ thực để lưu vào `dim_node`."
        self._write_section("1. Search & Geocoding", desc, res)

    # 2. Traffic Flow
    def test_traffic_flow(self, lat, lon):
        url = f"{BASE_URL}/traffic/services/4/flowSegmentData/absolute/10/json"
        params = {"key": self.key, "point": f"{lat},{lon}", "unit": "KMPH"}
        res = requests.get(url, params=params).json()
        desc = "Lấy vận tốc thực tế (`currentSpeed`) để nạp vào bảng `fact_traffic_flow`."
        self._write_section("2. Traffic Flow & Incidents", desc, res)

    # 3. Routing (Basic)
    def test_routing(self, start, end):
        url = f"{BASE_URL}/routing/1/calculateRoute/{start}:{end}/json"
        params = {"key": self.key, "traffic": "true"}
        res = requests.get(url, params=params).json()
        desc = "Tính toán quãng đường ngắn nhất phục vụ việc kiểm chứng (Validate) Engine CityFlow."
        self._write_section("3. Routing API", desc, res)

    # 4. Snap to Roads
    def test_snap_to_roads(self, points):
        url = f"{BASE_URL}/maps/traffic/api/snaptoroads/1/snaptoroads"
        params = {"key": self.key, "points": points}
        res = requests.get(url, params=params).json()
        desc = "Nắn chỉnh tọa độ GPS bị lệch từ báo cáo sự cố của người dân về đúng tim đường."
        self._write_section("4. Snap to Roads", desc, res)

    # 5. Map Display (Metadata)
    def test_map_display(self):
        zoom, x, y = 15, 26108, 15773 # Tọa độ tile gần Quận 1
        tile_url = f"{BASE_URL}/map/1/tile/basic/main/{zoom}/{x}/{y}.png?key={self.key}"
        res = {
            "api_type": "Raster Tile",
            "tile_url_example": tile_url,
            "usage": "Nhúng vào Leaflet/Mapbox trên Dashboard để hiển thị bản đồ nền."
        }
        desc = "Cung cấp URL hiển thị bản đồ trực quan cho dashboard điều hành Sở GTVT."
        self._write_section("5. Map Display API", desc, res)

if __name__ == "__main__":
    if not API_KEY:
        print("❌ Lỗi: Chưa tìm thấy API Key trong file .env")
    else:
        audit = TomTomAudit(API_KEY)
        
        # Chạy các bài kiểm tra tại khu vực Quận 1, TP.HCM
        audit.test_search_geocoding("Phố đi bộ Nguyễn Huệ, Quận 1")
        audit.test_traffic_flow(10.7781, 106.6994) # Ngã tư Lê Duẩn - Pasteur
        audit.test_routing("10.7797,106.6990", "10.7770,106.6953") # Đức Bà -> Dinh Độc Lập
        audit.test_snap_to_roads("10.7780,106.6993;10.7782,106.6995")
        audit.test_map_display()
        
        print(f"\n🚀 Hoàn thành! File báo cáo '{REPORT_FILE}' đã sẵn sàng để tra cứu.")