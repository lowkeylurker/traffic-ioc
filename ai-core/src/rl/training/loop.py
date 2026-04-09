import time

import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
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
        "minority_recall_35": [],
        "per_class_precision": [[] for _ in range(6)],
        "per_class_recall": [[] for _ in range(6)],
        "per_class_f1": [[] for _ in range(6)],
    }

    best_reward = -float("inf")
    all_preds = []
    all_targets = []

    for episode in range(num_episodes):
        state, _ = env.reset()
        if state is None:
            print("⚠️ Hết dữ liệu trong DataLoader, dừng huấn luyện sớm.")
            break

        total_reward = 0.0
        total_loss = 0.0
        step_count = 0
        episode_preds = []
        episode_targets = []

        start_time = time.time()

        for _ in range(max_steps_per_episode):
            target_label = env.current_target
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

            episode_preds.append(int(action))
            episode_targets.append(int(target_label))

            agent.memory.push(state, action, reward, next_state, done)
            loss = agent.optimize_model()

            state = next_state
            total_reward += reward
            total_loss += loss
            step_count += 1

            if done or state is None:
                break

        all_preds.extend(episode_preds)
        all_targets.extend(episode_targets)

        if episode_targets:
            ep_precision, ep_recall, ep_f1, _ = precision_recall_fscore_support(
                episode_targets,
                episode_preds,
                labels=[0, 1, 2, 3, 4, 5],
                average=None,
                zero_division=0,
            )
            minority_recall_35 = float((ep_recall[3] + ep_recall[4] + ep_recall[5]) / 3.0)
        else:
            ep_precision = np.zeros(6, dtype=np.float32)
            ep_recall = np.zeros(6, dtype=np.float32)
            ep_f1 = np.zeros(6, dtype=np.float32)
            minority_recall_35 = 0.0

        agent.update_epsilon()

        if episode % agent.target_update == 0:
            agent.sync_target_network()
            print("🔄 Đã đồng bộ kiến thức từ Policy Net sang Target Net.")

        avg_loss = total_loss / max(1, step_count)
        history["episode_rewards"].append(total_reward)
        history["avg_losses"].append(avg_loss)
        history["epsilons"].append(agent.epsilon)
        history["minority_recall_35"].append(minority_recall_35)
        for cls_idx in range(6):
            history["per_class_precision"][cls_idx].append(float(ep_precision[cls_idx]))
            history["per_class_recall"][cls_idx].append(float(ep_recall[cls_idx]))
            history["per_class_f1"][cls_idx].append(float(ep_f1[cls_idx]))

        ep_time = time.time() - start_time

        print(
            f"🎬 Episode {episode + 1:03d}/{num_episodes} | Steps: {step_count} | "
            f"Time: {ep_time:.1f}s | Reward: {total_reward:8.1f} | "
            f"Avg Loss: {avg_loss:.4f} | Epsilon: {agent.epsilon:.3f} | "
            f"Recall[3-5]: {minority_recall_35:.4f}"
        )

        if total_reward > best_reward:
            best_reward = total_reward
            print(f"🌟 Tác tử đạt kỷ lục mới về Điểm thưởng ({best_reward:.1f})! Đang lưu bộ não...")
            torch.save(agent.policy_net.state_dict(), agent.checkpoint_path)

    print("\n✅ HUẤN LUYỆN RL HOÀN TẤT!")

    if all_targets:
        cm = confusion_matrix(all_targets, all_preds, labels=[0, 1, 2, 3, 4, 5])
        precision, recall, f1, support = precision_recall_fscore_support(
            all_targets,
            all_preds,
            labels=[0, 1, 2, 3, 4, 5],
            average=None,
            zero_division=0,
        )
        final_per_class = {}
        for cls_idx in range(6):
            final_per_class[f"class_{cls_idx}"] = {
                "precision": float(precision[cls_idx]),
                "recall": float(recall[cls_idx]),
                "f1": float(f1[cls_idx]),
                "support": int(support[cls_idx]),
            }
        history["final_summary"] = {
            "confusion_matrix": cm.tolist(),
            "per_class_metrics": final_per_class,
            "minority_recall_35": float((recall[3] + recall[4] + recall[5]) / 3.0),
            "best_reward": float(best_reward),
            "num_episodes": int(len(history["episode_rewards"])),
        }
    else:
        history["final_summary"] = {
            "confusion_matrix": [],
            "per_class_metrics": {},
            "minority_recall_35": 0.0,
            "best_reward": float(best_reward),
            "num_episodes": int(len(history["episode_rewards"])),
        }

    return history
