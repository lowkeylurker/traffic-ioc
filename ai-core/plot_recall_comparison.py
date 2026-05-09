import matplotlib.pyplot as plt
import numpy as np
import os

def generate_recall_comparison_plot():
    labels = ['Lớp 0', 'Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5']
    
    # Dữ liệu Recall theo yêu cầu
    vanilla_lstm = [0.99, 0.98, 0.85, 0.30, 0.05, 0.01]
    supervised_baseline = [0.85, 0.82, 0.78, 0.75, 0.68, 0.72]
    hybrid_dqn = [0.80, 0.78, 0.75, 0.82, 0.88, 0.92]

    x = np.arange(len(labels))
    width = 0.25  # Độ rộng của mỗi cột

    fig, ax = plt.subplots(figsize=(12, 6), dpi=300)
    
    # Vẽ 3 nhóm cột
    rects1 = ax.bar(x - width, vanilla_lstm, width, label='Vanilla LSTM (Baseline)', color='#cfd8dc')
    rects2 = ax.bar(x, supervised_baseline, width, label='Supervised Baseline', color='#1e88e5')
    rects3 = ax.bar(x + width, hybrid_dqn, width, label='Hybrid Double DQN (Ours)', color='#b71c1c')

    # Thêm đường lưới
    ax.set_axisbelow(True)
    ax.yaxis.grid(color='gray', linestyle='dashed', alpha=0.3)

    # Nhãn và Tiêu đề
    ax.set_ylabel('Recall Score', fontweight='bold')
    ax.set_title('So sánh chỉ số Độ phủ (Recall) giữa các mô hình trên từng mức độ giao thông', 
                 fontsize=15, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontweight='bold')
    ax.set_ylim(0, 1.1)
    ax.legend(loc='upper right')

    # 1. Khoanh vùng điểm nhấn (Lớp 4, Lớp 5)
    # Rectangle((x, y), width, height)
    rect_highlight = plt.Rectangle((3.5, 0), 2.2, 1.05, fill=False, edgecolor='red', lw=2, ls='--')
    ax.add_patch(rect_highlight)

    # 2. Thêm mũi tên chỉ vào sự chênh lệch tại Lớp 5
    ax.annotate('RL vọt lên > 90% Recall nhờ Asymmetric Reward,\ntrong khi LSTM sụp đổ hoàn toàn', 
                xy=(5.2, 0.92), xytext=(2.5, 0.95),
                arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=8),
                fontsize=10, fontweight='bold', color='#b71c1c',
                bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#b71c1c", lw=1.5, alpha=0.9))

    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'recall_comparison_chart.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo biểu đồ so sánh Recall (3 mô hình): {save_path}")

if __name__ == "__main__":
    generate_recall_comparison_plot()
