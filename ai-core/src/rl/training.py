"""
training.py - RL Training Pipeline

Triển khai training cho DQN + PPO agents:
- Data loading (fact_traffic_flow, engineered features)
- Environment initialization
- Agent initialization
- Training loop (episodes, steps)
- Experience replay sampling
- Policy update
- Evaluation metrics
- Model checkpoint saving

Placeholder cho future sprint.
"""

"""
training.py - The Training Loop for Congestion Prediction

Hợp nhất Environment, DQNAgent và ReplayBuffer.
Huấn luyện Agent thông qua phương trình Bellman và Backpropagation.
"""

import os

import joblib
import torch
import torch.nn as nn
import numpy as np
from src.utils.data_loader import load_segment_data
from src.rl.congestion_env import CongestionEnv
from src.rl.dqn_agent import DQNAgent
from src.rl.experience_replay import ReplayBuffer
import matplotlib.pyplot as plt
from src.utils.data_loader import load_segment_data, get_segments_in_corridor

def train_agent(segment_id: int):
    # ==========================================
    # 1. KHỞI TẠO CÁC THÀNH PHẦN
    # ==========================================
    print("Đang tải dữ liệu huấn luyện...")
    # Lấy dữ liệu nhiều hơn một chút để Agent có đủ tình huống học
    df = load_segment_data(segment_id=segment_id, start_date='2026-03-13', end_date='2026-03-15', peak_hours_only=True)
    
    # Khởi tạo Môi trường
    env = CongestionEnv(df=df, history_window=12, prediction_horizon=1, congestion_threshold=0.15)
    
    # Khởi tạo Agent (State có 6 features)
    agent = DQNAgent(state_dim=6, hidden_dim=64, lr=0.001)
    
    # Khởi tạo Bộ nhớ
    buffer = ReplayBuffer(capacity=5000)
    
    # Hàm Loss (Mean Squared Error - Sai số toàn phương trung bình)
    criterion = nn.MSELoss()
    
    # ==========================================
    # 2. SIÊU THAM SỐ (HYPERPARAMETERS)
    # ==========================================
    num_episodes = 50        # Số vòng lặp qua lại toàn bộ dữ liệu (Epochs)
    batch_size = 32          # Số lượng mẫu lấy ra học mỗi lần
    gamma = 0.99             # Hệ số chiết khấu tương lai (Discount factor)
    epsilon = 1.0            # Tỷ lệ khám phá ngẫu nhiên ban đầu (100%)
    epsilon_min = 0.05       # Tỷ lệ khám phá tối thiểu (5%)
    epsilon_decay = 0.995    # Tốc độ giảm sự ngẫu nhiên
    target_update_freq = 5   # Cập nhật mạng Target sau mỗi 5 episodes
    
    #  Tạo 2 mảng để lưu lại lịch sử Reward và Loss cho biểu đồ
    all_rewards = []
    all_losses = []

    print("\n🚀 BẮT ĐẦU HUẤN LUYỆN DQN AGENT...")
    
    # ==========================================
    # 3. VÒNG LẶP HUẤN LUYỆN (TRAINING LOOP)
    # ==========================================
    for episode in range(num_episodes):
        state, _ = env.reset()
        total_reward = 0
        loss_history = []
        done = False
        
        while not done:
            # Agent chọn hành động (Kết hợp ngẫu nhiên và suy luận)
            action = agent.select_action(state, epsilon)
            
            # Môi trường phản hồi
            next_state, reward, done, _, _ = env.step(action)
            total_reward += reward
            
            # Lưu trải nghiệm vào trí nhớ
            buffer.push(state, action, reward, next_state, done)
            
            # Cập nhật state cho bước tiếp theo
            state = next_state
            
            # BẮT ĐẦU HỌC NẾU BỘ NHỚ ĐỦ LỚN
            if len(buffer) >= batch_size:
                # 3.1 Lấy mẫu ngẫu nhiên từ Buffer
                b_states, b_actions, b_rewards, b_next_states, b_dones = buffer.sample(batch_size)
                
                # Chuyển đổi sang PyTorch Tensor
                b_states = torch.FloatTensor(b_states).to(agent.device)
                b_actions = torch.LongTensor(b_actions).unsqueeze(1).to(agent.device)
                b_rewards = torch.FloatTensor(b_rewards).unsqueeze(1).to(agent.device)
                b_next_states = torch.FloatTensor(b_next_states).to(agent.device)
                b_dones = torch.FloatTensor(b_dones).unsqueeze(1).to(agent.device)
                
                # 3.2 Tính Q-value hiện tại (Dự đoán của Policy Net)
                # Dùng gather để lấy đúng Q-value của action đã thực hiện
                current_q = agent.policy_net(b_states).gather(1, b_actions)
                
                # 3.3 Tính Q-value Mục tiêu (Dựa trên Phương trình Bellman)
                with torch.no_grad():
                    # Lấy Q-value lớn nhất của State tiếp theo từ Target Net
                    max_next_q = agent.target_net(b_next_states).max(1)[0].unsqueeze(1)
                    # Công thức Bellman: Reward + Gamma * Max(Next_Q) (Nếu chưa done)
                    target_q = b_rewards + (gamma * max_next_q * (1 - b_dones))
                
                # 3.4 Tính Loss và Lan truyền ngược (Backpropagation)
                loss = criterion(current_q, target_q)
                
                agent.optimizer.zero_grad() # Xóa gradient cũ
                loss.backward()             # Tính đạo hàm riêng theo Chain Rule
                agent.optimizer.step()      # Cập nhật trọng số (Weights)
                
                loss_history.append(loss.item())
        
        # Cập nhật Epsilon (Giảm dần sự ngẫu nhiên, tăng cường dùng não)
        if epsilon > epsilon_min:
            epsilon *= epsilon_decay
            
        # Cập nhật mạng Target
        if episode % target_update_freq == 0:
            agent.target_net.load_state_dict(agent.policy_net.state_dict())
            
        # In kết quả sau mỗi Episode
        avg_loss = np.mean(loss_history) if loss_history else 0.0
        all_rewards.append(total_reward)
        all_losses.append(avg_loss)
        print(f"Episode {episode + 1}/{num_episodes} | Reward: {total_reward:.1f} | Epsilon: {epsilon:.3f} | Loss: {avg_loss:.4f}")

    # ==========================================
    # 4. LƯU MÔ HÌNH (SAVE MODEL)
    # ==========================================
    # Tạo thư mục nếu chưa có
    os.makedirs('models/congestion_rl', exist_ok=True)
    model_path = 'models/congestion_rl/dqn_agent.pt'
    torch.save(agent.policy_net.state_dict(), model_path)
    print(f"\n✅ Đã huấn luyện xong và lưu mô hình tại: {model_path}")

    # ==========================================
    # 5. VẼ BIỂU ĐỒ HỘI TỤ (VISUALIZATION) [THÊM TOÀN BỘ PHẦN NÀY VÀO CUỐI HÀM]
    # ==========================================
    print("Đang vẽ biểu đồ hội tụ...")
    plt.figure(figsize=(14, 5))
    
    # 5.1 Biểu đồ Reward
    plt.subplot(1, 2, 1)
    plt.plot(all_rewards, color='royalblue', alpha=0.6, label='Reward/Episode')
    
    # Thêm đường xu hướng (Moving Average) làm mượt biểu đồ
    window_size = 20
    if len(all_rewards) >= window_size:
        moving_avg = np.convolve(all_rewards, np.ones(window_size)/window_size, mode='valid')
        # Dịch chuyển mảng x để căn giữa đường MA
        plt.plot(range(window_size-1, len(all_rewards)), moving_avg, color='darkorange', linewidth=2, label=f'MA ({window_size})')
        
    plt.title('Tổng Phần Thưởng (Total Reward) qua từng Episode', fontsize=12)
    plt.xlabel('Episode')
    plt.ylabel('Reward')
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.5)

    # 5.2 Biểu đồ Loss
    plt.subplot(1, 2, 2)
    plt.plot(all_losses, color='crimson', alpha=0.7)
    plt.title('Mức độ Sai số (Loss) qua từng Episode', fontsize=12)
    plt.xlabel('Episode')
    plt.ylabel('Loss (MSE)')
    plt.grid(True, linestyle='--', alpha=0.5)

    plt.tight_layout()
    plot_path = 'models/congestion_rl/training_convergence.png'
    plt.savefig(plot_path, dpi=300)
    print(f"📈 Đã lưu biểu đồ thành công tại: {plot_path}")

    # [CẬP NHẬT Ở CUỐI HÀM] Lưu Model và Scaler THEO ID
    os.makedirs('models/congestion_rl', exist_ok=True)
    
    # 1. Lưu trọng số Model
    model_path = f'models/congestion_rl/dqn_agent_{segment_id}.pt'
    torch.save(agent.policy_net.state_dict(), model_path)
    
    # 2. Lưu Scaler từ Environment
    scaler_path = f'models/congestion_rl/scaler_{segment_id}.pkl'
    joblib.dump(env.scaler, scaler_path)
    
    print(f"\n✅ Đã lưu Model tại: {model_path}")
    print(f"✅ Đã lưu Scaler tại: {scaler_path}")

def train_corridor_agents(corridor_id: int):
    print(f"\n🚀 BẮT ĐẦU CHIẾN DỊCH HUẤN LUYỆN CHO CORRIDOR {corridor_id}...")
    
    # 1. Lấy danh sách toàn bộ Segment ID thuộc Corridor này
    segment_ids = get_segments_in_corridor(corridor_id)
    
    if not segment_ids:
        print(f"❌ Không tìm thấy segment nào thuộc corridor {corridor_id} trong DB.")
        return
        
    total_segments = len(segment_ids)
    print(f"🛣️ Tìm thấy {total_segments} đoạn đường. Bắt đầu lặp...")
    
    # 2. Vòng lặp huấn luyện từng Model
    success_count = 0
    for idx, seg_id in enumerate(segment_ids):
        print("\n" + "="*50)
        print(f"🔄 ĐANG HUẤN LUYỆN MODEL [{idx + 1}/{total_segments}] - SEGMENT ID: {seg_id}")
        print("="*50)
        
        try:
            # Gọi lại hàm train_agent bạn đã viết lúc nãy
            train_agent(segment_id=seg_id)
            success_count += 1
        except Exception as e:
            # Dùng try-except để nếu 1 đoạn đường bị lỗi (ví dụ không có data), 
            # vòng lặp không bị crash mà sẽ chạy tiếp đoạn đường khác.
            print(f"⚠️ Lỗi khi huấn luyện Segment {seg_id}: {e}")
            print("Chuyển sang Segment tiếp theo...")
            
    print("\n" + "="*50)
    print(f"✅ CHIẾN DỊCH HOÀN TẤT: Đã huấn luyện thành công {success_count}/{total_segments} models.")
    print("="*50)


if __name__ == "__main__":
    train_corridor_agents(corridor_id=646713380690000556)
