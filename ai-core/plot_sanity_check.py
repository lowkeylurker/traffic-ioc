import matplotlib.pyplot as plt
import numpy as np
import os

def generate_sanity_check_plots():
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6), dpi=300)
    
    # --- SUBPLOT 1: Tốc độ & Mật độ (Static Constraint) ---
    x = np.linspace(0, 1, 100)
    # Đường biên ngưỡng vật lý (Threshold)
    boundary = 80 * (1 - x**2)
    
    ax1.plot(x, boundary, color='black', linestyle='--', linewidth=2, label='Ngưỡng Vật lý (Threshold)')
    
    # Rải điểm hợp lệ (Xanh)
    np.random.seed(42)
    valid_x = np.random.uniform(0, 0.9, 100)
    valid_y = 70 * (1 - valid_x**1.5) * np.random.uniform(0.5, 0.9, 100)
    ax1.scatter(valid_x, valid_y, color='green', alpha=0.5, s=20, label='Dữ liệu Hợp lệ (Valid)')
    
    # Rải điểm phi lý (Đỏ) - Góc trên bên phải
    invalid_x = np.random.uniform(0.7, 0.95, 8)
    invalid_y = np.random.uniform(60, 80, 8)
    ax1.scatter(invalid_x, invalid_y, color='red', s=40, marker='x', label='Dữ liệu Ảo giác (Invalid)')
    
    # Chú thích Subplot 1
    ax1.annotate('Bị loại bỏ:\nKẹt xe nặng nhưng vận tốc cao\n(Ảo giác GAN)', 
                 xy=(0.8, 70), xytext=(0.4, 85),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1),
                 fontsize=9, fontweight='bold', color='red', ha='center')
    
    ax1.set_title('A. Kiểm tra Ràng buộc Tốc độ - Chỉ số Kẹt xe', fontweight='bold')
    ax1.set_xlabel('Chỉ số Kẹt xe (Traffic Index)', fontweight='bold')
    ax1.set_ylabel('Vận tốc (km/h)', fontweight='bold')
    ax1.set_ylim(0, 100)
    ax1.legend(loc='lower left', fontsize=8)
    ax1.grid(True, linestyle=':', alpha=0.6)

    # --- SUBPLOT 2: Độ mượt thời gian (Dynamic Constraint) ---
    timesteps = np.arange(1, 14)
    
    # Đường hợp lệ (Xanh) - Giảm mượt mà
    valid_path = [80, 78, 75, 70, 65, 55, 45, 38, 30, 25, 22, 18, 15]
    ax2.plot(timesteps, valid_path, color='green', marker='o', linewidth=2, label='Hợp lệ (Quán tính dòng xe)')
    
    # Đường phi lý (Đỏ) - Sudden Jump
    invalid_path = [78, 77, 76, 75, 74, 10, 10, 9, 8, 7, 7, 6, 5]
    ax2.plot(timesteps, invalid_path, color='red', linestyle='--', marker='x', linewidth=2, label='Vượt ngưỡng vật lý (Sudden Jump)')
    
    # Khoanh vùng lỗi
    circle = plt.Circle((5.5, 42), 12, color='red', fill=False, linestyle=':', linewidth=2)
    ax2.add_patch(circle)
    
    # Chú thích Subplot 2
    ax2.annotate('Bị loại bỏ:\nSudden Jump\nvượt ngưỡng vật lý', 
                 xy=(6, 15), xytext=(10, 50),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1),
                 fontsize=9, fontweight='bold', color='red', ha='center')

    ax2.set_title('B. Kiểm tra Tính mượt mà (Temporal Smoothness)', fontweight='bold')
    ax2.set_xlabel('Bước thời gian (Timestep - 15 min intervals)', fontweight='bold')
    ax2.set_ylabel('Vận tốc (km/h)', fontweight='bold')
    ax2.set_ylim(0, 100)
    ax2.set_xticks(timesteps)
    ax2.legend(loc='upper right', fontsize=8)
    ax2.grid(True, linestyle=':', alpha=0.6)

    plt.suptitle('Cơ chế hoạt động của Màng lọc Hậu kiểm Vật lý (Physical Sanity Filter) trên dữ liệu CTGAN', 
                 fontsize=14, fontweight='bold', y=1.02)
    
    plt.tight_layout()
    
    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'physical_sanity_check.png')
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Đã tạo thành công sơ đồ Hậu kiểm Vật lý: {save_path}")

if __name__ == "__main__":
    generate_sanity_check_plots()
