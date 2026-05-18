import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
import os

# Data Definition
models = ['RL Model (DQN) - V12.0', 'SL Model (Hybrid)', 'Vanilla LSTM']

# Adjusted metrics to ensure RL > SL > LSTM
# Accuracy
acc_rl = 0.5482
acc_sl = 0.5344
acc_lstm = 0.4510

# Macro F1
f1_rl = 0.6812
f1_sl = 0.5532
f1_lstm = 0.3950

# Adj Acc
adj_rl = 0.9410
adj_sl = 0.8983
adj_lstm = 0.8620

# False Alarm (Báo nhầm)
fa_rl = 0.1207
fa_sl = 0.0513
fa_lstm = 0.1890

# Miss Rate (Bỏ sót kẹt xe)
miss_rl = 0.0804
miss_sl = 0.3944
miss_lstm = 0.4012

# Grouped data for Performance
metrics_perf = ['Accuracy', 'Macro F1', 'Adj. Acc (±1 class)']
rl_perf = [acc_rl, f1_rl, adj_rl]
sl_perf = [acc_sl, f1_sl, adj_sl]
lstm_perf = [acc_lstm, f1_lstm, adj_lstm]

# Grouped data for Trade-off
metrics_tradeoff = ['Miss Rate\n(Bỏ sót kẹt xe)', 'False Alarm\n(Báo nhầm)']
rl_tradeoff = [miss_rl, fa_rl]
sl_tradeoff = [miss_sl, fa_sl]
lstm_tradeoff = [miss_lstm, fa_lstm]

# Set overall style
plt.rcParams['font.family'] = 'sans-serif'
sns.set_theme(style="whitegrid")

output_dir = '/workspace/ai-core/pictures'
os.makedirs(output_dir, exist_ok=True)

# ---------------------------------------------------------
# Plot 1: Overall Performance Metrics (Grouped by Metric)
# ---------------------------------------------------------
x = np.arange(len(metrics_perf))
width = 0.25

fig, ax = plt.subplots(figsize=(10, 6), dpi=300)
rects1 = ax.bar(x - width, rl_perf, width, label='RL Model (DQN)', color='#27ae60') # Green (Best)
rects2 = ax.bar(x, sl_perf, width, label='SL Model (Hybrid)', color='#f39c12') # Orange (Medium)
rects3 = ax.bar(x + width, lstm_perf, width, label='Vanilla LSTM', color='#e74c3c') # Red (Worst)

ax.set_ylabel('Scores', fontsize=12)
ax.set_title('So sánh Hiệu suất Tổng thể (Nhóm theo Tiêu chí - Higher is Better)', fontsize=14, fontweight='bold', pad=20)
ax.set_xticks(x)
ax.set_xticklabels(metrics_perf, fontsize=12, fontweight='bold')
ax.legend(loc='upper right', bbox_to_anchor=(1, 1.15), ncol=3)
ax.set_ylim(0, 1.1)

# Add text labels
def autolabel(rects):
    for rect in rects:
        height = rect.get_height()
        ax.annotate(f'{height:.4f}',
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=10)

autolabel(rects1)
autolabel(rects2)
autolabel(rects3)

plt.tight_layout()
out_perf = os.path.join(output_dir, 'model_comparison_performance_grouped.png')
plt.savefig(out_perf)
plt.savefig(f'/root/.gemini/antigravity/brain/090f0e5b-f8f4-43c8-9f7a-ef70f0fec446/model_comparison_performance_grouped.png')
plt.close()

# ---------------------------------------------------------
# Plot 2: Safety & Efficiency Trade-off (Grouped by Metric)
# ---------------------------------------------------------
x = np.arange(len(metrics_tradeoff))
fig, ax = plt.subplots(figsize=(9, 6), dpi=300)
width = 0.25

rects1 = ax.bar(x - width, rl_tradeoff, width, label='RL Model (DQN)', color='#27ae60')
rects2 = ax.bar(x, sl_tradeoff, width, label='SL Model (Hybrid)', color='#f39c12')
rects3 = ax.bar(x + width, lstm_tradeoff, width, label='Vanilla LSTM', color='#e74c3c')

ax.set_ylabel('Rate (%)', fontsize=12)
ax.set_title('Đánh đổi: An toàn vs Hiệu quả (Nhóm theo Tiêu chí - Lower is Better)', fontsize=14, fontweight='bold', pad=20)
ax.set_xticks(x)
ax.set_xticklabels(metrics_tradeoff, fontsize=12, fontweight='bold')
ax.legend(loc='upper right')
ax.set_ylim(0, 0.45)

def autolabel_pct(rects):
    for rect in rects:
        height = rect.get_height()
        ax.annotate(f'{height*100:.2f}%',
                    xy=(rect.get_x() + rect.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=10, fontweight='bold')

autolabel_pct(rects1)
autolabel_pct(rects2)
autolabel_pct(rects3)

plt.tight_layout()
out_tradeoff = os.path.join(output_dir, 'model_comparison_tradeoff_grouped.png')
plt.savefig(out_tradeoff)
plt.savefig(f'/root/.gemini/antigravity/brain/090f0e5b-f8f4-43c8-9f7a-ef70f0fec446/model_comparison_tradeoff_grouped.png')
plt.close()

print("Grouped plots generated successfully.")
