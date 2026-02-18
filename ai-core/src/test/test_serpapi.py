import os
import json
from datetime import datetime
from dotenv import load_dotenv
from serpapi import GoogleSearch

# Load cấu hình
load_dotenv()
API_KEY = os.getenv("SERPAPI_KEY")
_RESULT_DIR = os.path.join(os.path.dirname(__file__), "result")
os.makedirs(_RESULT_DIR, exist_ok=True)
REPORT_FILE = os.path.join(_RESULT_DIR, "SERPAPI_CONTEXT_REPORT.md")

class SerpApiAudit:
    def __init__(self, api_key):
        self.key = api_key
        with open(REPORT_FILE, "w", encoding="utf-8") as f:
            f.write(f"# 🕵️ Báo cáo Dữ liệu Bối cảnh SerpApi - UTRAFFIC\n\n")
            f.write(f"- **Ngày thực hiện:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"- **Mục tiêu:** Thu thập dữ liệu sự kiện, địa điểm và tin tức để dự báo nhu cầu giao thông.\n\n")
            f.write("---\n\n")

    def _log_to_md(self, title, description, data):
        with open(REPORT_FILE, "a", encoding="utf-8") as f:
            f.write(f"## {title}\n")
            f.write(f"**Mô tả:** {description}\n\n")
            f.write("### 📥 Dữ liệu mẫu (JSON):\n")
            f.write("```json\n")
            f.write(json.dumps(data, indent=4, ensure_ascii=False)) # Cắt bớt nếu quá dài
            f.write("\n...\n```\n\n")
            f.write("---\n\n")
        print(f"✅ Đã lưu kết quả: {title}")

    # 1. Google Events API (Lấy sự kiện tại Quận 1)
    def test_events(self):
        params = {
            "engine": "google_events",
            "q": "Events in HoChiMinh City District 1",
            "api_key": self.key,
            # "htichips": "date:today"
        }
        search = GoogleSearch(params)
        print(search.get_dict())
        results = search.get_dict().get("events_results", [])
        desc = "Xác định các sự kiện lớn gây biến động lưu lượng xe đổ về Quận 1."
        self._log_to_md("1. Google Events API", desc, results[:1]) # Lấy 1 sự kiện mẫu để báo cáo, có thể mở rộng nếu cần.

    # 2. Google Local API (Lấy Popular Times của Diamond Plaza)
    def test_local_popular_times(self):
        params = {
            "engine": "google_local",
            "q": "Diamond Plaza Quận 1",
            "hl": "vi",
            "gl": "vn",
            "api_key": self.key
        }
        search = GoogleSearch(params)
        results = search.get_dict().get("local_results", [])
        desc = "Trích xuất thông tin địa điểm và độ bận rộn (Popular Times) để dự báo nhu cầu (Demand)."
        self._log_to_md("2. Google Local API", desc, results[0] if results else {})

    # 3. Google News API (Tin tức kẹt xe/ngập lụt)
    def test_news(self):
        params = {
            "engine": "google_news",
            "q": "kẹt xe Quận 1 Hồ Chí Minh",
            "hl": "vi",
            "gl": "vn",
            "api_key": self.key
        }
        search = GoogleSearch(params)
        results = search.get_dict().get("news_results", [])
        desc = "Cập nhật tin tức sự cố thời gian thực cho bảng `dim_traffic_news`."
        self._log_to_md("3. Google News API", desc, results[:3])

    # 4. Google Trends API (Xu hướng tìm kiếm)
    def test_trends(self):
        params = {
            "engine": "google_trends",
            "q": "kẹt xe",
            "geo": "VN",
            "api_key": self.key
        }
        search = GoogleSearch(params)
        results = search.get_dict().get("interest_over_time", {})
        desc = "Theo dõi mức độ quan tâm của người dân để đưa vào mô hình ML dự báo sớm."
        self._log_to_md("4. Google Trends API", desc, results)

if __name__ == "__main__":
    if not API_KEY:
        print("❌ Lỗi: Chưa tìm thấy SERPAPI_KEY trong file .env")
    else:
        audit = SerpApiAudit(API_KEY)
        audit.test_events()
        audit.test_local_popular_times()
        audit.test_news()
        audit.test_trends()
        print(f"\n🚀 Hoàn thành! Mở file '{REPORT_FILE}' để xem báo cáo bối cảnh.")