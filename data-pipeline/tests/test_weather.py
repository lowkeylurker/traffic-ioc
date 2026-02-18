import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("OPENWEATHER_API_KEY")
LAT, LON = 10.776, 106.700
# Sử dụng base URL của bản 2.5 (Free hoàn toàn)
BASE_URL = "https://api.openweathermap.org/data/2.5"
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "results")
os.makedirs(_RESULT_DIR, exist_ok=True)
REPORT_FILE = os.path.join(_RESULT_DIR, "OPEN_WEATHER_MAP_REPORT.md")

class WeatherFreeAudit:
    def __init__(self, api_key):
        self.key = api_key
        self.report_file = REPORT_FILE
        with open(self.report_file, "w", encoding="utf-8") as f:
            f.write(f"# 🌦️ Báo cáo Thời tiết (Free Tier 2.5) - UTRAFFIC\n\n")
            f.write(f"> **Lưu ý:** Đây là dữ liệu từ gói Free không cần thẻ tín dụng.\n\n")

    def _log(self, title, data):
        with open(self.report_file, "a", encoding="utf-8") as f:
            f.write(f"## {title}\n")
            f.write("```json\n")
            f.write(json.dumps(data, indent=4, ensure_ascii=False))
            f.write("\n```\n\n---\n\n")
        print(f"✅ Đã lưu: {title}")

    # 1. Thời tiết hiện tại (Dùng cho fact_traffic_flow)
    def test_current(self):
        url = f"{BASE_URL}/weather"
        params = {"lat": LAT, "lon": LON, "appid": self.key, "units": "metric", "lang": "vi"}
        res = requests.get(url, params=params).json()
        self._log("1. Thời tiết hiện tại (Current Weather)", res)

    # 2. Dự báo 5 ngày (Dùng cho kịch bản CityFlow tương lai)
    def test_forecast(self):
        url = f"{BASE_URL}/forecast"
        params = {"lat": LAT, "lon": LON, "appid": self.key, "units": "metric", "lang": "vi"}
        res = requests.get(url, params=params).json()
        # Chỉ lấy 3 mục dự báo đầu tiên cho gọn báo cáo
        res['list'] = res['list'][:3]
        self._log("2. Dự báo 5 ngày / 3 giờ (Forecast)", res)

if __name__ == "__main__":
    if not API_KEY:
        print("❌ Lỗi: Chưa tìm thấy API Key trong file .env")
    else:
        audit = WeatherFreeAudit(API_KEY)
        audit.test_current()
        audit.test_forecast()
        print(f"\n🚀Kiểm tra file '{REPORT_FILE}'.")