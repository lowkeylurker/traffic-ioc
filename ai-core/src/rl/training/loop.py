from __future__ import annotations

import time
from typing import Callable

import numpy as np
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
import torch

from src.ml.feature_contract import NUM_CLASSES


def train_rl_agent(
    env,
    agent,
    num_episodes=50,
    max_steps_per_episode=10000,
    eval_fn: Callable[[], dict] | None = None,
    early_stop_patience: int = 0,
    early_stop_min_delta: float = 0.0,
    early_stop_eval_interval: int = 1,
    early_stop_warmup_episodes: int = 0,
    writer=None,
):
    """Main DQN training loop."""
    print("\n" + "=" * 50)
    print("🎮 BẮT ĐẦU TRẬN ĐẤU: ĐÀO TẠO TÁC TỬ GIAO THÔNG")
    print("=" * 50)

    history = {
        "episode_rewards": [],
        "avg_losses": [],
        "epsilons": [],
        "eval_macro_f1": [],
        "eval_events": [],
        "action_distribution": [],
        "action_counts": [],
        "mean_q_value": [],
        "mean_target_q_value": [],
        "mean_td_error": [],
        "reward_breakdown": [],
        "per_class_precision": [[] for _ in range(NUM_CLASSES)],
        "per_class_recall": [[] for _ in range(NUM_CLASSES)],
        "per_class_f1": [[] for _ in range(NUM_CLASSES)],
    }

    best_reward = -float("inf")
    best_eval_macro_f1 = -float("inf")
    no_improve_eval_count = 0
    stopped_early = False
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
        episode_reward_breakdown = {
            "accuracy_bonus": 0.0,
            "adjacency_penalty": 0.0,
            "binary_error_penalty": 0.0,
        }
        q_values_buffer = []
        target_q_values_buffer = []
        td_error_buffer = []

        start_time = time.time()

        for _ in range(max_steps_per_episode):
            target_label = env.current_target
            action = agent.select_action(state)
            next_state, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            episode_preds.append(int(action))
            episode_targets.append(int(target_label))

            reward_breakdown = info.get("reward_breakdown", {}) if isinstance(info, dict) else {}
            for key in episode_reward_breakdown:
                episode_reward_breakdown[key] += float(reward_breakdown.get(key, 0.0))

            agent.memory.push(state, action, reward, next_state, done)
            optimize_stats = agent.optimize_model()
            loss = float(optimize_stats.get("loss", 0.0))
            if loss > 0.0 or optimize_stats.get("current_q_mean", 0.0) != 0.0:
                q_values_buffer.append(float(optimize_stats.get("current_q_mean", 0.0)))
                target_q_values_buffer.append(float(optimize_stats.get("target_q_mean", 0.0)))
                td_error_buffer.append(float(optimize_stats.get("td_error_mean", 0.0)))

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
                labels=list(range(NUM_CLASSES)),
                average=None,
                zero_division=0,
            )
        else:
            ep_precision = np.zeros(NUM_CLASSES, dtype=np.float32)
            ep_recall = np.zeros(NUM_CLASSES, dtype=np.float32)
            ep_f1 = np.zeros(NUM_CLASSES, dtype=np.float32)

        action_counts = np.bincount(np.asarray(episode_preds, dtype=np.int64), minlength=NUM_CLASSES).astype(np.float32)
        action_distribution = action_counts / max(1.0, float(action_counts.sum()))
        mean_q_value = float(np.mean(q_values_buffer)) if q_values_buffer else 0.0
        mean_target_q_value = float(np.mean(target_q_values_buffer)) if target_q_values_buffer else 0.0
        mean_td_error = float(np.mean(td_error_buffer)) if td_error_buffer else 0.0

        agent.update_epsilon()

        if episode % agent.target_update == 0:
            agent.sync_target_network()
            print("🔄 Đã đồng bộ kiến thức từ Policy Net sang Target Net.")

        avg_loss = total_loss / max(1, step_count)
        history["episode_rewards"].append(total_reward)
        history["avg_losses"].append(avg_loss)
        history["epsilons"].append(agent.epsilon)
        history["action_counts"].append(action_counts.tolist())
        history["action_distribution"].append(action_distribution.tolist())
        history["mean_q_value"].append(mean_q_value)
        history["mean_target_q_value"].append(mean_target_q_value)
        history["mean_td_error"].append(mean_td_error)
        history["reward_breakdown"].append({k: float(v) for k, v in episode_reward_breakdown.items()})
        for cls_idx in range(NUM_CLASSES):
            history["per_class_precision"][cls_idx].append(float(ep_precision[cls_idx]))
            history["per_class_recall"][cls_idx].append(float(ep_recall[cls_idx]))
            history["per_class_f1"][cls_idx].append(float(ep_f1[cls_idx]))

        ep_time = time.time() - start_time

        avg_bonus = episode_reward_breakdown["accuracy_bonus"] / max(1, step_count)
        avg_adj_penalty = episode_reward_breakdown["adjacency_penalty"] / max(1, step_count)
        avg_bin_penalty = episode_reward_breakdown["binary_error_penalty"] / max(1, step_count)

        print(
            f"🎬 Episode {episode + 1:03d}/{num_episodes} | Steps: {step_count} | "
            f"Time: {ep_time:.1f}s | Reward: {total_reward:8.1f} | "
            f"Avg Loss: {avg_loss:.4f} | Epsilon: {agent.epsilon:.3f} | "
            f"Q: {mean_q_value:.4f} | TD: {mean_td_error:.4f}"
        )
        print(f"💰 Reward Breakdown (avg/step) | Bonus: {avg_bonus:+.2f} | Adj Pen: {avg_adj_penalty:+.2f} | Bin Pen: {avg_bin_penalty:+.2f}")

        # Bổ sung log phân bổ hành động (Class counts)
        action_counts_str = " | ".join([f"C{i}:{int(action_counts[i])}" for i in range(NUM_CLASSES)])
        print(f"📊 Action Distribution: {action_counts_str}")
        # Bổ sung log chỉ số đánh giá (Recall, Precision, F1) cho từng Class
        recall_str = " | ".join([f"C{i}:{ep_recall[i]:.2f}" for i in range(NUM_CLASSES)])
        precision_str = " | ".join([f"C{i}:{ep_precision[i]:.2f}" for i in range(NUM_CLASSES)])
        f1_str = " | ".join([f"C{i}:{ep_f1[i]:.2f}" for i in range(NUM_CLASSES)])
        
        print(f"📈 Per-Class Recall   : {recall_str}")
        print(f"🎯 Per-Class Precision: {precision_str}")
        print(f"💎 Per-Class F1-Score : {f1_str}")

        if writer is not None:
            writer.add_scalar("rl/train/episode_reward", total_reward, episode + 1)
            writer.add_scalar("rl/train/avg_loss", avg_loss, episode + 1)
            writer.add_scalar("rl/train/epsilon", agent.epsilon, episode + 1)
            writer.add_scalar("rl/train/mean_q_value", mean_q_value, episode + 1)
            writer.add_scalar("rl/train/mean_target_q_value", mean_target_q_value, episode + 1)
            writer.add_scalar("rl/train/mean_td_error", mean_td_error, episode + 1)
            writer.add_scalar("rl/train/action_entropy", float(-np.sum(action_distribution * np.log(action_distribution + 1e-12))), episode + 1)
            for cls_idx in range(NUM_CLASSES):
                writer.add_scalar(f"rl/train/action_distribution/class_{cls_idx}", float(action_distribution[cls_idx]), episode + 1)
                writer.add_scalar(f"rl/train/per_class_recall/class_{cls_idx}", float(ep_recall[cls_idx]), episode + 1)
                writer.add_scalar(f"rl/train/per_class_precision/class_{cls_idx}", float(ep_precision[cls_idx]), episode + 1)
                writer.add_scalar(f"rl/train/per_class_f1/class_{cls_idx}", float(ep_f1[cls_idx]), episode + 1)
            for key, value in episode_reward_breakdown.items():
                writer.add_scalar(f"rl/train/reward_breakdown/{key}", float(value), episode + 1)

        if total_reward > best_reward:
            best_reward = total_reward
            print(f"🌟 Tác tử đạt kỷ lục mới về Điểm thưởng ({best_reward:.1f})! Đang lưu bộ não...")
            torch.save(agent.policy_net.state_dict(), agent.checkpoint_path)

        should_eval = (
            eval_fn is not None
            and early_stop_patience > 0
            and (episode + 1) >= early_stop_warmup_episodes
            and (episode + 1) % max(1, early_stop_eval_interval) == 0
        )
        if should_eval:
            eval_summary = eval_fn() or {}
            eval_macro_f1 = float(eval_summary.get("macro_f1", 0.0))
            history["eval_macro_f1"].append(eval_macro_f1)
            history["eval_events"].append(
                {
                    "episode": int(episode + 1),
                    "macro_f1": eval_macro_f1,
                    "accuracy": float(eval_summary.get("accuracy", 0.0)),
                    "num_samples": int(eval_summary.get("num_samples", 0)),
                    "per_class_metrics": eval_summary.get("per_class_metrics", {}),
                }
            )

            if writer is not None:
                writer.add_scalar("rl/eval/macro_f1", eval_macro_f1, episode + 1)
                writer.add_scalar("rl/eval/accuracy", float(eval_summary.get("accuracy", 0.0)), episode + 1)
                eval_per_class = eval_summary.get("per_class_metrics", {})
                for cls_idx in range(NUM_CLASSES):
                    cls_metrics = eval_per_class.get(f"class_{cls_idx}", {})
                    writer.add_scalar(f"rl/eval/per_class_recall/class_{cls_idx}", float(cls_metrics.get("recall", 0.0)), episode + 1)
                    writer.add_scalar(f"rl/eval/per_class_precision/class_{cls_idx}", float(cls_metrics.get("precision", 0.0)), episode + 1)
                    writer.add_scalar(f"rl/eval/per_class_f1/class_{cls_idx}", float(cls_metrics.get("f1", 0.0)), episode + 1)

            if eval_macro_f1 > (best_eval_macro_f1 + early_stop_min_delta):
                best_eval_macro_f1 = eval_macro_f1
                no_improve_eval_count = 0
                print(
                    f"📈 Eval macro_f1 improved to {eval_macro_f1:.4f} "
                    f"(patience reset to {early_stop_patience})"
                )
                torch.save(agent.policy_net.state_dict(), agent.checkpoint_path)
            else:
                no_improve_eval_count += 1
                print(
                    f"⏳ Eval macro_f1={eval_macro_f1:.4f} did not improve "
                    f"(best={best_eval_macro_f1:.4f}, no_improve={no_improve_eval_count}/{early_stop_patience})"
                )
                if no_improve_eval_count >= early_stop_patience:
                    stopped_early = True
                    print(
                        "🛑 Early stopping triggered by eval_macro_f1: "
                        f"no improvement for {early_stop_patience} eval checks."
                    )
                    break

    print("\n✅ HUẤN LUYỆN RL HOÀN TẤT!")

    if all_targets:
        cm = confusion_matrix(all_targets, all_preds, labels=list(range(NUM_CLASSES)))
        precision, recall, f1, support = precision_recall_fscore_support(
            all_targets,
            all_preds,
            labels=list(range(NUM_CLASSES)),
            average=None,
            zero_division=0,
        )
        final_per_class = {}
        for cls_idx in range(NUM_CLASSES):
            final_per_class[f"class_{cls_idx}"] = {
                "precision": float(precision[cls_idx]),
                "recall": float(recall[cls_idx]),
                "f1": float(f1[cls_idx]),
                "support": int(support[cls_idx]),
            }
        
        history["final_summary"] = {
            "confusion_matrix": cm.tolist(),
            "per_class_metrics": final_per_class,
            "best_reward": float(best_reward),
            "best_eval_macro_f1": float(best_eval_macro_f1 if best_eval_macro_f1 > -float("inf") else 0.0),
            "stopped_early": bool(stopped_early),
            "early_stop_no_improve_count": int(no_improve_eval_count),
            "num_episodes": int(len(history["episode_rewards"])),
            "mean_q_value": float(np.mean(history["mean_q_value"])) if history["mean_q_value"] else 0.0,
            "mean_target_q_value": float(np.mean(history["mean_target_q_value"])) if history["mean_target_q_value"] else 0.0,
            "mean_td_error": float(np.mean(history["mean_td_error"])) if history["mean_td_error"] else 0.0,
        }
    else:
        history["final_summary"] = {
            "confusion_matrix": [],
            "per_class_metrics": {},
            "best_reward": float(best_reward),
            "best_eval_macro_f1": float(best_eval_macro_f1 if best_eval_macro_f1 > -float("inf") else 0.0),
            "stopped_early": bool(stopped_early),
            "early_stop_no_improve_count": int(no_improve_eval_count),
            "num_episodes": int(len(history["episode_rewards"])),
            "mean_q_value": 0.0,
            "mean_target_q_value": 0.0,
            "mean_td_error": 0.0,
        }

    if writer is not None:
        writer.flush()

    return history
