"""
corridor_inference.py - Real-time Congestion Prediction for Corridors

Dự báo tình trạng kẹt xe cho toàn bộ các đoạn đường trên một trục giao thông.
Hệ thống được tối ưu để chỉ kích hoạt và truy vấn Database trong giờ cao điểm.
"""

import torch
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from sklearn.preprocessing import MinMaxScaler
from src.utils.data_loader import load_corridor_data
from src.rl.dqn_agent import DQNAgent

def predict_corridor_congestion(corridor_id: int, simulated_time: str = None):
    print(f"🔍 Đang khởi động hệ thống dự báo cho CORRIDOR {corridor_id}...")
    
    # ========================================================
    # 1. NGƯỜI GÁC CỔNG: CHỈ PHỤC VỤ GIỜ CAO ĐIỂM
    # ========================================================
    # Xác định thời gian hiện tại (Có thể truyền simulated_time để test)
    if simulated_time:
        now = pd.to_datetime(simulated_time)
        print(f"🕒 Chế độ giả lập thời gian: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        now = datetime.now()
        
    hour = now.hour
    is_morning_peak = 6 <= hour <= 10
    is_evening_peak = 16 <= hour <= 20
    
    if not (is_morning_peak or is_evening_peak):
        print(f"\n⚠️ HỆ THỐNG ĐANG NGHỈ: Hiện tại là {now.strftime('%H:%M')}.")
        print("💡 AI-Core chỉ kích hoạt truy vấn và dự báo trong ca sáng (06:00-10:00) và ca chiều (16:00-20:00).")
        return # Thoát ngay lập tức, KHÔNG chọc vào Database gây lãng phí

    # ========================================================
    # 2. KHỞI TẠO AGENT VÀ TRUY VẤN DỮ LIỆU
    # ========================================================
    agent = DQNAgent(state_dim=6, hidden_dim=64)
    model_path = 'models/congestion_rl/dqn_agent.pt'
    
    try:
        agent.policy_net.load_state_dict(torch.load(model_path))
        agent.policy_net.eval() 
    except FileNotFoundError:
        print(f"❌ Không tìm thấy file mô hình tại {model_path}. Hãy chạy training.py trước!")
        return

    # Tính toán khung thời gian: Kéo đúng 4 tiếng gần nhất (3 tiếng cho Agent + 1 tiếng bù trừ nội suy)
    start_time = now - timedelta(hours=4)
    start_date_str = start_time.strftime('%Y-%m-%d %H:%M:%S')
    end_date_str = now.strftime('%Y-%m-%d %H:%M:%S')

    print(f"📡 Đang kéo dữ liệu realtime từ {start_time.strftime('%H:%M')} đến {now.strftime('%H:%M')}...")
    corridor_data = load_corridor_data(
        corridor_id=corridor_id, 
        start_date=start_date_str, 
        end_date=end_date_str,   
        peak_hours_only=True     
    )
    
    if not corridor_data:
        print("❌ Không có dữ liệu cho Corridor này trong khung giờ vừa qua.")
        return

    # ========================================================
    # 3. TIỀN XỬ LÝ & BATCH TENSOR
    # ========================================================
    feature_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 
                    'delay_seconds', 'is_peak_hour', 'weather_severity']
    
    valid_segment_ids = []
    valid_tensors = []
    
    for seg_id, df in corridor_data.items():
        if len(df) < 12:
            continue
            
        scaler = MinMaxScaler()
        scaler.fit(df[feature_cols])
        
        recent_data = df.tail(12).copy()
        
        # Kiểm tra tính liên tục của 12 timesteps (165 phút)
        seg_start = recent_data['timestamp'].iloc[0]
        seg_end = recent_data['timestamp'].iloc[-1]
        if seg_end - seg_start != pd.Timedelta(minutes=15 * 11):
            continue 
            
        scaled_data = scaler.transform(recent_data[feature_cols])
        valid_tensors.append(scaled_data)
        valid_segment_ids.append(seg_id)

    if not valid_tensors:
        print("\n❌ TỪ CHỐI DỰ BÁO: Không có segment nào đạt chuẩn dữ liệu liên tục 3 tiếng.")
        return

    # ========================================================
    # 4. CHẠY MODEL (BATCH INFERENCE)
    # ========================================================
    batch_tensor = torch.FloatTensor(np.array(valid_tensors)).to(agent.device)
    
    with torch.no_grad():
        q_values_batch = agent.policy_net(batch_tensor)
        predictions = q_values_batch.argmax(dim=1).cpu().numpy()
        probabilities = torch.softmax(q_values_batch, dim=1).cpu().numpy()

    # ========================================================
    # 5. IN DASHBOARD
    # ========================================================
    predict_time = now + pd.Timedelta(minutes=15)
    
    print("\n" + "="*70)
    print(f"🚦 BẢN ĐỒ DỰ BÁO TRỤC ĐƯỜNG (CORRIDOR {corridor_id})")
    print(f"Mốc thời gian hiện tại: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Dự báo cho 15 phút tới: {predict_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 70)
    print(f"{'SEGMENT ID':<20} | {'TRẠNG THÁI (15P TỚI)':<25} | {'ĐỘ TIN CẬY'}")
    print("-" * 70)
    
    congested_count = 0
    for idx, seg_id in enumerate(valid_segment_ids):
        pred = predictions[idx]
        conf = probabilities[idx][pred] * 100
        
        if pred == 1:
            status = "🔴 SẼ KẸT XE"
            congested_count += 1
        else:
            status = "🟢 THÔNG THOÁNG"
            
        print(f"{str(seg_id):<20} | {status:<25} | {conf:.1f}%")
        
    print("-" * 70)
    print(f"📊 Tổng quan trục đường: {congested_count}/{len(valid_segment_ids)} đoạn có nguy cơ ùn tắc.")
    if congested_count > len(valid_segment_ids) / 2:
        print("🚨 KHUYẾN NGHỊ: Bật kịch bản điều hướng giao thông toàn tuyến (Green Wave).")
    print("="*70 + "\n")

if __name__ == "__main__":
    # Test lúc ĐANG TRONG giờ cao điểm (Ca chiều 19:45)
    predict_corridor_congestion(corridor_id=646713380690000556, simulated_time='2026-03-15 19:45:00')
    
    # Test lúc NGOÀI giờ cao điểm (Trưa 12:00) -> Sẽ bị chặn ngay lập tức
    predict_corridor_congestion(corridor_id=646713380690000556, simulated_time='2026-03-15 12:00:00')