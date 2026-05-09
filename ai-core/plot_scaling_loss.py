import matplotlib.pyplot as plt
import numpy as np
import os

def plot_scaling_loss():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6), dpi=300)
    
    # Tạo lưới tọa độ
    x = np.linspace(-10, 10, 100)
    y = np.linspace(-10, 10, 100)
    X, Y = np.meshgrid(x, y)

    # 1. TRƯỚC KHI CHUẨN HÓA (Hàm Loss hình Elip dẹt)
    # Z = a*x^2 + b*y^2 (với a >> b)
    Z1 = 10 * X**2 + Y**2
    ax1.contour(X, Y, Z1, levels=15, cmap='viridis', alpha=0.6)
    
    # Vẽ đường zigzag (Gradient bị dao động)
    zigzag_x = [9, -7, 6, -4, 3, -1, 0.5, 0]
    zigzag_y = [9, 7, 5, 3, 1, 0.5, 0.2, 0]
    ax1.plot(zigzag_x, zigzag_y, color='red', lw=2, marker='o', markersize=4, label='Optimizer Path')
    ax1.annotate('Gradient dao động\n(Oscillation)', xy=(4, 4), xytext=(6, 8),
                 arrowprops=dict(arrowstyle='->', color='red'), color='red', fontweight='bold', fontsize=9)
    
    ax1.set_title('Trước khi chuẩn hóa (Raw Data)', fontsize=12, fontweight='bold')
    ax1.set_xlabel('Feature 1 (VD: Tốc độ)', fontsize=10)
    ax1.set_ylabel('Feature 2 (VD: Lưu lượng)', fontsize=10)

    # 2. SAU KHI CHUẨN HÓA (Hàm Loss hình Tròn đồng tâm)
    # Z = x^2 + y^2
    Z2 = X**2 + Y**2
    ax2.contour(X, Y, Z2, levels=15, cmap='viridis', alpha=0.6)
    
    # Vẽ mũi tên thẳng (Hội tụ trực tiếp)
    ax2.annotate('', xy=(0, 0), xytext=(8, 8),
                 arrowprops=dict(arrowstyle='->', color='green', lw=3))
    ax2.text(4, 5, 'Hội tụ nhanh,\ntrực tiếp', color='green', fontweight='bold', fontsize=10, ha='center')
    
    ax2.set_title('Sau khi áp dụng StandardScaler', fontsize=12, fontweight='bold')
    ax2.set_xlabel('Scaled Feature 1', fontsize=10)
    ax2.set_ylabel('Scaled Feature 2', fontsize=10)

    # Tiêu đề tổng quát
    plt.suptitle('Hình 5.t: Tác động của StandardScaler lên bề mặt Hàm mất mát và tốc độ hội tụ', 
                 fontsize=14, fontweight='bold', y=1.02)

    # Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'loss_landscape_scaling.png')

    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Ảnh Loss Landscape đã được lưu tại: {save_path}")

if __name__ == "__main__":
    plot_scaling_loss()
