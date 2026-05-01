import json
from pathlib import Path

def update_notebook_00():
    path = Path('notebooks/00_EDA_Sandbox.ipynb')
    if not path.exists():
        print(f"File not found: {path.absolute()}")
        return
    
    with open(path, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    
    updated = False
    for cell in nb['cells']:
        if cell.get('id') == 'eda_refinement_header':
            new_source = [
                "## 5. Kết luận & Tinh chỉnh\n",
                "\n",
                "Dựa trên phân tích Tầm quan trọng (Feature Importance) và tương quan, ta quyết định tinh chỉnh bộ tính năng như sau:\n",
                "\n",
                "**1. Danh sách Feature loại bỏ:**\n",
                "- `quality_flag`: Ít biến động hoặc không đóng góp đáng kể vào mô hình.\n",
                "- `default_lane_count`: Thông tin tĩnh không giúp phân biệt mức độ ùn tắc linh hoạt.\n",
                "- `speed_ratio`: Đã loại bỏ để đơn giản hóa input (thay thế bằng raw speed).\n",
                "- `speed_delta`: Loại bỏ do tính toán delta gây nhiễu.\n",
                "- `is_one_way`, `ward_district_id`: Thông tin tĩnh không cần thiết.\n",
                "\n",
                "**2. Danh sách Feature giữ lại:**\n",
                "- `current_speed_kmh`, `traffic_index`, `delay_seconds`: Các biến động lực học chính (Core Dynamic Features).\n",
                "- `time_sin`, `time_cos`, `is_peak_hour`, `is_weekend`, `is_business_hours`: Các biến bối cảnh thời gian.\n",
                "- `tomtom_frc`, `weather_key`, `shift_code`, `day_of_week`: Các biến phân loại.\n",
                "\n",
                "**3. Quyết định:**\n",
                "- Đã cập nhật `src/ml/feature_contract.py` để phản ánh các thay đổi trên.\n",
                "- `traffic_index` được giữ lại như một dynamic feature quan trọng.\n",
                "- Notebook 01 (ETL) sẽ tự động áp dụng contract mới này.\n",
                "\n",
                "**Hành động tiếp theo:** Chạy lại Notebook 01 để làm sạch tập dữ liệu chuẩn bị cho huấn luyện RL."
            ]
            cell['source'] = new_source
            updated = True
            print(f"Updated summary in {path}")
    
    if updated:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(nb, f, indent=1, ensure_ascii=False)

if __name__ == "__main__":
    update_notebook_00()
