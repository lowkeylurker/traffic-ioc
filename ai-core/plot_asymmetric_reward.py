import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def generate_reward_heatmap():
    # 1. Thiết lập ma trận dữ liệu
    reward_matrix = np.array([
        [ 15,  -1,  -6,  -9, -17, -20], # Lớp 0 thưởng +15
        [ -1,  15,  -1,  -6, -14, -17], # Lớp 1 thưởng +15
        [ -6,  -1,  15,  -1,  -6,  -9],  # Lớp 2 thưởng +15
        [ -9,  -6,  -1,  10,  -1,  -6],  # Lớp 3
        [-22, -19,  -6,  -1,  10,  -1],  # Lớp 4 (Phạt bỏ lọt giảm xuống)
        [-25, -22,  -9,  -6,  -1,  10]   # Lớp 5 (Phạt bỏ lọt giảm xuống)
    ])

    labels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

    plt.figure(figsize=(8, 7), dpi=300)
    
    # 2. Vẽ Heatmap
    # Dùng RdYlGn (Red-Yellow-Green) nhưng đảo ngược để Green là dương
    cmap = sns.diverging_palette(10, 130, sep=20, as_cmap=True)
    
    ax = sns.heatmap(reward_matrix, annot=True, fmt="d", cmap=cmap, 
                    xticklabels=labels, yticklabels=labels,
                    cbar_kws={'label': 'Giá trị Reward'},
                    linewidths=.5, center=0)

    # 3. Vẽ điểm nhấn (Khung viền vùng Phạt sinh tử) - Đổi sang màu TÍM
    rect = plt.Rectangle((0, 4), 2, 2, fill=False, edgecolor='purple', lw=3, ls='--')
    ax.add_patch(rect)

    # 4. Thêm mũi tên và chú thích
    ax.annotate('Vùng Phạt Sinh Tử (Fatal Penalty):\nBỏ lọt thảm họa giao thông', 
                xy=(1, 5), xytext=(3, 5.5),
                arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=8),
                fontsize=10, fontweight='bold', color='purple',
                bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="purple", lw=1.5, alpha=0.9))

    # 5. Hình thức
    plt.title('Thiết kế Ma trận Thưởng/Phạt Không Đối Xứng\n(Asymmetric Reward Shaping)', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xlabel('Dự báo của Agent (Action)', fontweight='bold')
    plt.ylabel('Thực tế Môi trường (Target)', fontweight='bold')
    
    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'asymmetric_reward_matrix.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo Heatmap ma trận phần thưởng: {save_path}")

if __name__ == "__main__":
    generate_reward_heatmap()
