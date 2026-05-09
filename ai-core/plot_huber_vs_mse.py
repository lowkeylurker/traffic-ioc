import matplotlib.pyplot as plt
import numpy as np
import os

def generate_huber_vs_mse_plot():
    # 1. Thiết lập dữ liệu
    x = np.linspace(-5, 5, 200)
    
    # MSE: 0.5 * x^2
    y_mse = 0.5 * x**2
    
    # Huber Loss (delta = 1)
    delta = 1.0
    y_huber = np.where(np.abs(x) <= delta, 
                       0.5 * x**2, 
                       delta * (np.abs(x) - 0.5 * delta))

    plt.figure(figsize=(8, 5), dpi=300)
    
    # 2. Vẽ các đường cong
    plt.plot(x, y_mse, color='#1976d2', linestyle='--', label='MSE Loss (Bình phương)', alpha=0.7)
    plt.plot(x, y_huber, color='#d32f2f', linewidth=2.5, label='Huber Loss (Robust)')

    # 3. Tô màu vùng Outliers
    plt.axvspan(-5, -3, color='gray', alpha=0.1)
    plt.axvspan(3, 5, color='gray', alpha=0.1)

    # 4. Annotations
    # Vùng trung tâm
    plt.annotate('Vùng sai số nhỏ:\nHuber = MSE\n(Hội tụ mượt mà)', 
                 xy=(0, 0.2), xytext=(0, 4),
                 arrowprops=dict(arrowstyle='->', color='blue', lw=1),
                 bbox=dict(boxstyle="round,pad=0.3", fc="#e3f2fd", ec="blue", alpha=0.9),
                 ha='center', fontsize=9)

    # Vùng Outliers
    plt.text(4, 8, 'Vùng nhiễu (Outliers):\nHuber chuyển tuyến tính,\ntránh khuếch đại Gradient', 
             bbox=dict(boxstyle="round,pad=0.3", fc="#ffebee", ec="red", alpha=0.9),
             ha='center', fontsize=8, color='#c62828')

    # 5. Hình thức
    plt.title('So sánh hàm xấp xỉ giá trị Huber Loss và MSE trước dữ liệu ngoại lai', fontsize=12, fontweight='bold', pad=15)
    plt.xlabel('Sai số (Error)', fontweight='bold')
    plt.ylabel('Giá trị phạt (Loss)', fontweight='bold')
    plt.ylim(0, 13)
    plt.xlim(-5, 5)
    plt.grid(True, linestyle=':', alpha=0.5)
    plt.legend(loc='upper center')
    
    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'huber_loss_comparison.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo biểu đồ Huber vs MSE: {save_path}")

if __name__ == "__main__":
    generate_huber_vs_mse_plot()
