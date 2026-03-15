"""
inference.py - Real-time Congestion Prediction

Load mô hình DQN đã huấn luyện và đưa ra dự báo realtime trong giờ cao điểm.
"""

import torch
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from src.utils.data_loader import load_segment_data
from src.rl.dqn_agent import DQNAgent

def predict_congestion(segment_id: int):
    print(f"🔍 Đang khởi động hệ thống dự báo cho Segment {segment_id}...")
    
    # 1. Khởi tạo Agent và Load tệp trọng số
    state_dim = 6
    agent = DQNAgent(state_dim=state_dim, hidden_dim=64)
    model_path = 'models/congestion_rl/dqn_agent.pt'
    
    try:
        agent.policy_net.load_state_dict(torch.load(model_path))
        agent.policy_net.eval() 
    except FileNotFoundError:
        print(f"❌ Không tìm thấy file mô hình tại {model_path}. Hãy chạy training.py trước!")
        return

    # 2. Lấy dữ liệu (Bật bộ lọc giờ cao điểm)
    print("📡 Đang lấy dữ liệu realtime từ Data Warehouse...")
    df = load_segment_data(
        segment_id=segment_id, 
        start_date='2026-03-13', # Lấy lùi lại vài ngày để có đủ dữ liệu fit Scaler
        end_date='2026-03-16',   # Giả định hôm nay là 15/03 hoặc 16/03
        peak_hours_only=True     # BẬT LỌC GIỜ CAO ĐIỂM
    )
    
    feature_cols = ['current_speed_kmh', 'pcu_volume', 'traffic_index', 
                    'delay_seconds', 'is_peak_hour', 'weather_severity']
    
    if len(df) < 12:
        print(f"❌ Lỗi: Không đủ dữ liệu lịch sử để dự báo (chỉ có {len(df)} dòng).")
        return
        
    scaler = MinMaxScaler()
    scaler.fit(df[feature_cols])
    
    # Cắt lấy đúng 12 dòng cuối cùng
    recent_data = df.tail(12).copy()
    
    # ========================================================
    # LÁ CHẮN BẢO VỆ 1: KIỂM TRA TÍNH LIÊN TỤC CỦA CHUỖI
    # ========================================================
    start_time = recent_data['timestamp'].iloc[0]
    end_time = recent_data['timestamp'].iloc[-1]
    
    # 12 timesteps cách nhau 15 phút => Tổng thời gian phải đúng bằng 165 phút (11 khoảng)
    expected_duration = pd.Timedelta(minutes=15 * 11)
    
    if end_time - start_time != expected_duration:
        print("\n❌ TỪ CHỐI DỰ BÁO: Dữ liệu lịch sử bị đứt gãy!")
        print(f"- Thời gian bắt đầu: {start_time.strftime('%H:%M')}")
        print(f"- Thời gian kết thúc: {end_time.strftime('%H:%M')}")
        print("💡 Giải thích: Hệ thống hiện tại cần 3 giờ dữ liệu liên tục trong cùng một ca cao điểm. Bạn chỉ có thể chạy dự báo vào khoảng 09:00 - 10:00 (ca sáng) hoặc 19:00 - 20:00 (ca chiều).")
        return
        
    predict_time = end_time + pd.Timedelta(minutes=15)
    
    # ========================================================
    # LÁ CHẮN BẢO VỆ 2: KIỂM TRA KHUNG GIỜ DỰ BÁO
    # ========================================================
    hour = predict_time.hour
    is_morning_peak = 6 <= hour <= 10
    is_evening_peak = 16 <= hour <= 20
    
    if not (is_morning_peak or is_evening_peak):
        print(f"\n⚠️ BỎ QUA: Khung giờ dự báo {predict_time.strftime('%H:%M')} nằm ngoài giờ cao điểm phục vụ.")
        return

    # 3. Đưa vào Mô hình dự báo
    scaled_recent_data = scaler.transform(recent_data[feature_cols])
    
    with torch.no_grad(): 
        state_tensor = torch.FloatTensor(scaled_recent_data).unsqueeze(0).to(agent.device)
        q_values = agent.policy_net(state_tensor)
        prediction = q_values.argmax(dim=1).item()
        confidence = torch.softmax(q_values, dim=1)[0][prediction].item() * 100

    # 4. Xuất kết quả
    print("\n" + "="*50)
    print(f"🚦 KẾT QUẢ DỰ BÁO GIAO THÔNG (Segment {segment_id})")
    print(f"Thời điểm hiện tại (Nhận biết cuối): {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Thời điểm dự báo (15 phút tới):     {predict_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 50)
    
    if prediction == 1:
        print(f"⚠️ CẢNH BÁO: KHẢ NĂNG KẸT XE CAO (Độ tin cậy: {confidence:.2f}%)")
    else:
        print(f"✅ DỰ BÁO: ĐƯỜNG THÔNG THOÁNG (Độ tin cậy: {confidence:.2f}%)")
    print("="*50 + "\n")

if __name__ == "__main__":
    predict_congestion(segment_id=8206185629154005)