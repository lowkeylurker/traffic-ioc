import json
import os

def validate_cityflow_data(roadnet_path, flow_path):
    print(f"🔍 Đang khởi động quy trình kiểm định dữ liệu...")
    errors = 0
    
    # 1. Load dữ liệu
    with open(roadnet_path, 'r') as r, open(flow_path, 'r') as f:
        roadnet = json.load(r)
        flow = json.load(f)

    # 2. Thu thập danh sách Road IDs từ Roadnet
    # CityFlow yêu cầu ID phải khớp tuyệt đối
    road_ids_in_net = {road['id'] for road in roadnet['roads']}
    print(f"✅ Tìm thấy {len(road_ids_in_net)} con đường trong Roadnet.")

    # 3. Kiểm tra từng luồng giao thông trong Flow
    for idx, f_item in enumerate(flow):
        # Kiểm tra headwayTime (phải nằm trong vehicle theo phiên bản của bạn)
        vehicle = f_item.get('vehicle', {})
        if 'headwayTime' not in vehicle:
            print(f"❌ Lỗi: Flow[{idx}] thiếu 'headwayTime' trong đối tượng 'vehicle'.")
            errors += 1
            
        # Kiểm tra tính hợp lệ của Route
        route = f_item.get('route', [])
        for road_id in route:
            if road_id not in road_ids_in_net:
                print(f"❌ Lỗi: Road ID '{road_id}' trong Flow[{idx}] không tồn tại trong Roadnet!")
                errors += 1

    # 4. Kiểm tra logic hạ tầng (Intersections)
    for inter in roadnet['intersections']:
        for r_id in inter.get('roads', []):
            if r_id not in road_ids_in_net:
                print(f"⚠️ Cảnh báo: Nút giao '{inter['id']}' tham chiếu đến Road ID '{r_id}' không tồn tại.")
                errors += 1

    # Kết luận
    if errors == 0:
        print("\n🚀 CHÚC MỪNG: Dữ liệu hoàn toàn khớp nhau! Bạn có thể chạy giả lập ngay.")
    else:
        print(f"\n🛑 PHÁT HIỆN {errors} LỖI. Vui lòng sửa trước khi khởi động CityFlow.")

# Chạy thử nghiệm
BASE_PATH = "/app/data/hcm_mini_map"
validate_cityflow_data(
    f"{BASE_PATH}/roadnet.json", 
    f"{BASE_PATH}/flow.json"
)