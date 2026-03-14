import cityflow
import os
import json

# 1. Đường dẫn tuyệt đối đến tệp cấu hình bên trong Container
CONFIG_PATH = "/app/data/hcm_mini_map/config.json"

def check_files():
    """Kiểm tra sự tồn tại của các tệp trước khi nạp vào Engine"""
    if not os.path.exists(CONFIG_PATH):
        print(f"❌ Không tìm thấy tệp config tại: {CONFIG_PATH}")
        return False
    
    # Đọc thử file config để lấy đường dẫn các file con
    with open(CONFIG_PATH, 'r') as f:
        conf = json.load(f)
        base_dir = conf.get("dir", "")
        roadnet = os.path.join(base_dir, conf.get("roadnetFile"))
        flow = os.path.join(base_dir, conf.get("flowFile"))
        
        print(f"📂 Đang kiểm tra dữ liệu tại: {base_dir}")
        print(f"  - Roadnet: {'✅ OK' if os.path.exists(roadnet) else '❌ MISSING'}")
        print(f"  - Flow:    {'✅ OK' if os.path.exists(flow) else '❌ MISSING'}")
        
    return os.path.exists(roadnet) and os.path.exists(flow)

# 2. Khởi chạy Engine
if check_files():
    print("\n--- 🚀 Đang nạp cấu hình vào CityFlow Engine ---")
    try:
        # Khởi tạo Engine từ file JSON trên đĩa
        engine = cityflow.Engine(CONFIG_PATH, thread_num=1)
        
        print("✅ Nạp dữ liệu thành công! Bắt đầu giả lập...")
        print(f"{'Bước':<10} | {'Số lượng xe':<15}")
        print("-" * 30)
        
        for i in range(101):
            engine.next_step()
            if i % 10 == 0:
                count = engine.get_vehicle_count()
                print(f"{i:<10} | {count:<15}")
                
    except Exception as e:
        print(f"❌ Lỗi khi vận hành CityFlow: {str(e)}")
        print("💡 Gợi ý: Kiểm tra lại log lỗi của CityFlow phía trên để biết trường dữ liệu nào bị thiếu.")