import time

import torch


def train_rl_agent(env, agent, num_episodes=50, max_steps_per_episode=10000):
    """Main DQN training loop."""
    print("\n" + "=" * 50)
    print("🎮 BẮT ĐẦU TRẬN ĐẤU: ĐÀO TẠO TÁC TỬ GIAO THÔNG")
    print("=" * 50)

    history = {
        "episode_rewards": [],
        "avg_losses": [],
        "epsilons": [],
    }

    best_reward = -float("inf")

    for episode in range(num_episodes):
        state, _ = env.reset()
        if state is None:
            print("⚠️ Hết dữ liệu trong DataLoader, dừng huấn luyện sớm.")
            break

        total_reward = 0.0
        total_loss = 0.0
        step_count = 0

        start_time = time.time()

        for _ in range(max_steps_per_episode):
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            agent.memory.push(state, action, reward, next_state, done)
            loss = agent.optimize_model()

            state = next_state
            total_reward += reward
            total_loss += loss
            step_count += 1

            if done or state is None:
                break

        agent.update_epsilon()

        if episode % agent.target_update == 0:
            agent.sync_target_network()
            print("🔄 Đã đồng bộ kiến thức từ Policy Net sang Target Net.")

        avg_loss = total_loss / max(1, step_count)
        history["episode_rewards"].append(total_reward)
        history["avg_losses"].append(avg_loss)
        history["epsilons"].append(agent.epsilon)

        ep_time = time.time() - start_time

        print(
            f"🎬 Episode {episode + 1:03d}/{num_episodes} | Steps: {step_count} | "
            f"Time: {ep_time:.1f}s | Reward: {total_reward:8.1f} | "
            f"Avg Loss: {avg_loss:.4f} | Epsilon: {agent.epsilon:.3f}"
        )

        if total_reward > best_reward:
            best_reward = total_reward
            print(f"🌟 Tác tử đạt kỷ lục mới về Điểm thưởng ({best_reward:.1f})! Đang lưu bộ não...")
            torch.save(agent.policy_net.state_dict(), "best_rl_agent.pt")

    print("\n✅ HUẤN LUYỆN RL HOÀN TẤT!")
    return history
