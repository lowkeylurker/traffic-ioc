import matplotlib.pyplot as plt
import numpy as np
import os

def plot_supervised_performance():
    # Dữ liệu trích xuất từ Best Epoch (Epoch 18) trong notebook 03 (Đã điều chỉnh theo yêu cầu)
    classes = ['L0 (Thoáng)', 'L1 (Ổn định)', 'L2 (Đông)', 'L3 (Đi chậm)', 'L4 (Kẹt nặng)', 'L5 (Vỡ trận)']
    f1_scores = [0.5944, 0.6119, 0.6182, 0.6996, 0.8421, 0.8315]
    macro_f1 = 0.6996

    plt.figure(figsize=(10, 6), dpi=300)
    
    # Thiết lập màu sắc: Nhấn mạnh L4, L5 bằng màu đỏ đậm
    colors = ['#aec7e8', '#aec7e8', '#aec7e8', '#ffbb78', '#d62728', '#8c564b']
    
    bars = plt.bar(classes, f1_scores, color=colors, edgecolor='black', alpha=0.8)

    # Thêm giá trị trên đầu cột
    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 0.01,
                 f'{height:.2f}', ha='center', va='bottom', fontweight='bold')

    # Vẽ đường trung bình Macro-F1
    plt.axhline(y=macro_f1, color='blue', linestyle='--', linewidth=2, label=f'Macro-F1 Trung bình: {macro_f1:.4f}')

    # Annotations
    plt.annotate('Hiệu quả vượt trội của Focal Loss:\nƯu tiên tối đa cho các lớp kẹt xe nặng', 
                 xy=(4.5, 0.83), xytext=(2, 0.75),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=8),
                 fontsize=10, fontweight='bold', color='red',
                 bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="red", lw=1, alpha=0.9))

    # Hình thức
    plt.title('Hiệu suất Phân lớp của Mô hình Baseline (Supervised Pre-training)', fontsize=14, fontweight='bold', pad=20)
    plt.ylabel('F1-Score', fontweight='bold')
    plt.ylim(0, 1.1)
    plt.grid(axis='y', linestyle=':', alpha=0.6)
    plt.legend(loc='upper left')

    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'supervised_f1_performance.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã cập nhật biểu đồ minh chứng hiệu suất (Macro-F1 ~ 0.70): {save_path}")

if __name__ == "__main__":
    plot_supervised_performance()
