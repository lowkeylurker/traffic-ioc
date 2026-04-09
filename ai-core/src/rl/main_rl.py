import torch
import numpy as np
import time
import joblib
import pandas as pd

# Import các module bạn đã xây dựng
from src.rl.traffic_env import TrafficForecastingEnv
from src.rl.agent import DQNAgent
from src.utils.data_loader import load_bulk_corridor_data

def train_rl_agent(env, agent, num_episodes=50, max_steps_per_episode=10000):
    """
    Vòng lặp huấn luyện chính cho Tác tử RL (DQN).
    """
    print("\n" + "="*50)
    print("🎮 BẮT ĐẦU TRẬN ĐẤU: ĐÀO TẠO TÁC TỬ GIAO THÔNG")
    print("="*50)
    
    # Biến lưu trữ để vẽ biểu đồ và đánh giá
    history = {
        'episode_rewards': [],
        'avg_losses': [],
        'epsilons': []
    }
    
    best_reward = -float('inf')
    
    for episode in range(num_episodes):
        # 1. Khởi tạo lại Môi trường cho Episode mới
        state, _ = env.reset()
        if state is None:
            print("⚠️ Hết dữ liệu trong DataLoader, dừng huấn luyện sớm.")
            break
            
        total_reward = 0.0
        total_loss = 0.0
        step_count = 0
        
        start_time = time.time()
        
        # 2. VÒNG LẶP STEP (Trò chơi diễn ra từng bước)
        for step in range(max_steps_per_episode):
            # Tác tử quan sát State và đưa ra Quyết định (Action)
            action = agent.select_action(state)
            
            # Môi trường phản hồi: Trạng thái mới, Điểm thưởng
            next_state, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            
            # Đẩy trải nghiệm vào Bộ nhớ (Replay Buffer)
            agent.memory.push(state, action, reward, next_state, done)
            
            # Tác tử Rút kinh nghiệm và Học (Cập nhật trọng số mạng Nơ-ron)
            loss = agent.optimize_model()
            
            # Cập nhật thông số theo dõi
            state = next_state
            total_reward += reward
            total_loss += loss
            step_count += 1
            
            if done or state is None:
                break # Kết thúc Episode
                
        # 3. CẬP NHẬT KIẾN THỨC SAU EPISODE
        # Giảm sự tò mò (Epsilon decay) để Tác tử bớt "nghịch" và tin vào kiến thức hơn
        agent.update_epsilon()
        
        # Đồng bộ Mạng Target (Target Network Sync) sau mỗi số lượng Episode nhất định
        if episode % agent.target_update == 0:
            agent.sync_target_network()
            print("🔄 Đã đồng bộ kiến thức từ Policy Net sang Target Net.")

        # 4. TỔNG KẾT VÀ GHI LOG
        avg_loss = total_loss / max(1, step_count)
        history['episode_rewards'].append(total_reward)
        history['avg_losses'].append(avg_loss)
        history['epsilons'].append(agent.epsilon)
        
        ep_time = time.time() - start_time
        
        print(f"🎬 Episode {episode+1:03d}/{num_episodes} | Steps: {step_count} | "
              f"Time: {ep_time:.1f}s | Reward: {total_reward:8.1f} | "
              f"Avg Loss: {avg_loss:.4f} | Epsilon: {agent.epsilon:.3f}")
              
        # 5. CHECKPOINTING (Lưu lại Tác tử xuất sắc nhất)
        # Khác với GĐ 1 lưu theo F1-Score, ở RL ta lưu theo Tổng Điểm Thưởng (Total Reward)
        if total_reward > best_reward:
            best_reward = total_reward
            print(f"🌟 Tác tử đạt kỷ lục mới về Điểm thưởng ({best_reward:.1f})! Đang lưu bộ não...")
            torch.save(agent.policy_net.state_dict(), 'best_rl_agent.pt')

    print("\n✅ HUẤN LUYỆN RL HOÀN TẤT!")
    return history