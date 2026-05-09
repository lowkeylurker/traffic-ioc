import matplotlib.pyplot as plt
import numpy as np
import os

def plot_embedding_comparison():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4), dpi=300)

    # 1. Vẽ One-hot Encoding (Ma trận thưa)
    # Giả định có 10 lớp, ma trận 10x10
    one_hot = np.zeros((10, 10))
    for i in range(10):
        one_hot[i, i] = 1
        
    ax1.imshow(one_hot, cmap='Greys', interpolation='nearest', alpha=0.3)
    # Vẽ các ô số 1 màu đỏ
    for i in range(10):
        ax1.add_patch(plt.Rectangle((i-0.5, i-0.5), 1, 1, color='red', alpha=0.8))
        ax1.text(i, i, '1', ha='center', va='center', color='white', fontsize=8, fontweight='bold')

    ax1.set_title('One-hot Encoding (N chiều)', fontsize=12, fontweight='bold', color='red')
    ax1.set_xticks([])
    ax1.set_yticks([])
    ax1.set_xlabel('Gây bùng nổ chiều (N rất lớn)\nMa trận thưa, thiếu quan hệ bối cảnh', fontsize=9, style='italic')

    # 2. Vẽ Dense Embedding (Ma trận đặc)
    # Giả định 10 lớp được nén vào 4 chiều (thay vì 8 cho dễ vẽ)
    embedding = np.random.uniform(-1, 1, (10, 4))
    
    im2 = ax2.imshow(embedding, cmap='YlGnBu', interpolation='nearest')
    # Hiển thị vài giá trị thập phân tiêu biểu
    for i in range(10):
        for j in range(4):
            val = f'{embedding[i, j]:.1f}'
            ax2.text(j, i, val, ha='center', va='center', color='black', fontsize=7)

    ax2.set_title('Dense Embedding (8 chiều)', fontsize=12, fontweight='bold', color='blue')
    ax2.set_xticks([])
    ax2.set_yticks([])
    ax2.set_xlabel('Không gian vector đặc (Dense)\nBảo toàn thông tin bối cảnh', fontsize=9, style='italic')

    # Chèn tiêu đề tổng quát
    plt.suptitle('So sánh One-hot Encoding vs. Dense Embedding', fontsize=14, fontweight='bold', y=1.05)

    # Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'embedding_comparison.png')

    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Ảnh so sánh Embedding đã được lưu tại: {save_path}")

if __name__ == "__main__":
    plot_embedding_comparison()
