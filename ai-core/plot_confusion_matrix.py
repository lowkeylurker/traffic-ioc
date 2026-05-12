import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def plot_confusion_matrix_bias():
    # 1. Thiết lập nhãn cho 6 lớp giao thông
    labels = ['Thông thoáng', 'Ổn định', 'Đông đúc', 'Ùn ứ', 'Ùn tắc', 'Vỡ trận']
    
    # 2. Sinh dữ liệu mô phỏng (Confusion Matrix)
    # Tổng mẫu mỗi lớp giả định là 1000
    cm = np.array([
        [950,  30,  10,   5,   3,   2], # Lớp 0: Recall rất cao
        [ 20, 920,  40,  15,   3,   2], # Lớp 1: Recall cao
        [ 10,  50, 910,  20,   5,   5], # Lớp 2: Recall cao
        [  5,  80, 120, 750,  30,  15], # Lớp 3: Recall khá
        [  2, 450, 200,  30, 300,  18], # Lớp 4: Recall thấp (0.3), nhầm vào lớp 1, 2
        [  1, 500, 350,  20,  29, 100], # Lớp 5: Recall rất thấp (0.1), nhầm vào lớp 1, 2
    ])

    # 3. Cấu hình biểu đồ
    plt.figure(figsize=(10, 8), dpi=300)
    sns.set_theme(style="white")
    
    # Vẽ heatmap
    ax = sns.heatmap(cm, annot=True, fmt='d', cmap='YlGnBu', 
                     xticklabels=labels, yticklabels=labels,
                     cbar_kws={'label': 'Số lượng mẫu (Samples)'})

    # 4. Khoanh vùng đỏ để nhấn mạnh "Majority Class Bias"
    # Lớp 4 (index 4) và Lớp 5 (index 5) bị dự báo nhầm vào Lớp 1 (index 1) và Lớp 2 (index 2)
    # Khung 1: Lớp 4, 5 nhầm vào Lớp 1
    rect1 = plt.Rectangle((1, 4), 1, 2, fill=False, edgecolor='red', lw=3, label='Bias Zone')
    # Khung 2: Lớp 4, 5 nhầm vào Lớp 2
    rect2 = plt.Rectangle((2, 4), 1, 2, fill=False, edgecolor='red', lw=3)
    
    ax.add_patch(rect1)
    ax.add_patch(rect2)

    # Thêm text ghi chú cho vùng bias
    plt.text(1.5, 4.5, "MAJORITY\nBIAS", color='red', ha='center', va='center', 
             fontweight='bold', fontsize=12, bbox=dict(facecolor='white', alpha=0.7, edgecolor='red'))

    # 5. Tiêu đề và nhãn
    plt.title('Ma trận nhầm lẫn của mô hình DL thuần túy\n(Minh họa thiên kiến lớp đa số)', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xlabel('Predicted Label (Nhãn dự báo)', fontsize=12, fontweight='bold')
    plt.ylabel('True Label (Nhãn thực tế)', fontsize=12, fontweight='bold')

    # 6. Lưu file
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'confusion_matrix_bias.png')

    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Ma trận nhầm lẫn đã được lưu tại: {save_path}")

if __name__ == "__main__":
    plot_confusion_matrix_bias()
