import os
import torch
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import joblib # [THÊM MỚI]
from src.utils.data_loader import load_corridor_data
from src.rl.dqn_agent import DQNAgent

def predict_corridor_congestion(corridor_id: int, simulated_time: str = None):
    print(f"🔍 Đang khởi động hệ thống dự báo cho CORRIDOR {corridor_id} (Local Models)...")
    
    # 1. Người gác cổng (Giữ nguyên)
    if simulated_time:
        now = pd.to_datetime(simulated_time)
    else:
        now = datetime.now()
        
    hour = now.hour
    if not (6 <= hour <= 10 or 16 <= hour <= 20):
        print(f"\n⚠️ HỆ THỐNG ĐANG NGHỈ. Chỉ phục vụ giờ cao điểm.")
        return

    # 2. Lấy dữ liệu Corridor (Giữ nguyên)
    start_time = now - timedelta(hours=4)
    corridor_data = load_corridor_data(
        corridor_id=corridor_id, 
        start_date=start_time.strftime('%Y-%m-%d %H:%M:%S'), 
        end_date=now.strftime('%Y-%m-%d %H:%M:%S'),   
        peak_hours_only=True     
    )
    
    if not corridor_data:
        return

    # Khởi tạo sãn Agent (Chúng ta chỉ cần 1 vỏ Agent, sau đó thay não liên tục)
    agent = DQNAgent(state_dim=6, hidden_dim=64)
    feature_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 'delay_seconds', 'is_peak_hour', 'weather_severity']
    
    print("\n" + "="*75)
    print(f"{'SEGMENT ID':<20} | {'TRẠNG THÁI (15P TỚI)':<25} | {'ĐỘ TIN CẬY'}")
    print("-" * 75)
    
    congested_count = 0
    valid_segments = 0

    # 3. Lặp qua từng đoạn đường và Load model TƯƠNG ỨNG
    for seg_id, df in corridor_data.items():
        if len(df) < 12:
            print(f"{str(seg_id):<20} | ⚪ KHÔNG ĐỦ DỮ LIỆU LỊCH SỬ    | N/A")
            continue
            
        model_path = f'models/congestion_rl/dqn_agent_{seg_id}.pt'
        scaler_path = f'models/congestion_rl/scaler_{seg_id}.pkl'
        
        if not (os.path.exists(model_path) and os.path.exists(scaler_path)):
            print(f"{str(seg_id):<20} | ⚠️ CHƯA ĐƯỢC HUẤN LUYỆN MODEL  | N/A")
            continue
            
        # Load Scaler riêng của đoạn đường này
        scaler = joblib.load(scaler_path)
        
        recent_data = df.tail(12).copy()
        if recent_data['timestamp'].iloc[-1] - recent_data['timestamp'].iloc[0] != pd.Timedelta(minutes=15 * 11):
            print(f"{str(seg_id):<20} | ⚪ DỮ LIỆU BỊ ĐỨT GÃY         | N/A")
            continue 
            
        # Chuẩn hóa bằng Scaler xịn
        scaled_data = scaler.transform(recent_data[feature_cols])
        state_tensor = torch.FloatTensor(scaled_data).unsqueeze(0).to(agent.device)
        
        # Load Não (Trọng số) riêng của đoạn đường này
        agent.policy_net.load_state_dict(torch.load(model_path))
        agent.policy_net.eval()
        
        # Chạy dự đoán
        with torch.no_grad():
            q_values = agent.policy_net(state_tensor)
            prediction = q_values.argmax(dim=1).item()
            confidence = torch.softmax(q_values, dim=1)[0][prediction].item() * 100
            
        valid_segments += 1
        if prediction == 1:
            print(f"{str(seg_id):<20} | 🔴 SẼ KẸT XE               | {confidence:.1f}%")
            congested_count += 1
        else:
            print(f"{str(seg_id):<20} | 🟢 THÔNG THOÁNG              | {confidence:.1f}%")

    print("="*75 + "\n")
    if valid_segments > 0:
        print(f"📊 Tổng quan: {congested_count}/{valid_segments} đoạn hợp lệ có nguy cơ kẹt xe.")

if __name__ == "__main__":
    predict_corridor_congestion(corridor_id=646713380690000556, simulated_time='2026-03-15 19:45:00')