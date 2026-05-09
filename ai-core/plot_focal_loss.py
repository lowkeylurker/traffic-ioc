import matplotlib.pyplot as plt
import numpy as np
import os

def generate_focal_loss_plot():
    # 1. Thiết lập dữ liệu
    x = np.linspace(0.01, 1, 100)
    
    # Cross-Entropy: -log(p)
    y_ce = -np.log(x)
    
    # Focal Loss: -(1-p)^gamma * log(p)
    y_focal_2 = -(1-x)**2 * np.log(x)
    y_focal_5 = -(1-x)**5 * np.log(x)

    plt.figure(figsize=(8, 6), dpi=300)
    
    # 2. Vẽ các đường cong
    plt.plot(x, y_ce, color='blue', label='Cross-Entropy Loss', linewidth=2)
    plt.plot(x, y_focal_2, color='red', linestyle='--', label='Focal Loss (gamma=2)', linewidth=2)
    plt.plot(x, y_focal_5, color='orange', linestyle=':', label='Focal Loss (gamma=5)', linewidth=2)

    # 3. Trang trí và Annotations
    # Vùng mẫu dễ (Well-classified)
    plt.axvspan(0.6, 1.0, color='gray', alpha=0.1)
    plt.text(0.8, 2.5, "Các mẫu Dễ đoán\n(Well-classified)", ha='center', fontsize=9, fontweight='bold', color='gray')

    # Chú thích về việc dập tắt Loss
    plt.annotate('Focal Loss chủ động dập tắt Loss\ncủa các mẫu dễ, ép mô hình tập trung\nvào vùng khó (p < 0.2)', 
                 xy=(0.8, 0.1), xytext=(0.4, 1.5),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=8),
                 fontsize=9, fontweight='bold', color='red', ha='center',
                 bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="red", lw=1, alpha=0.8))

    # Mũi tên chỉ vào sự sụt giảm Loss ở vùng p > 0.6
    plt.annotate('', xy=(0.7, 0.1), xytext=(0.7, 0.35),
                 arrowprops=dict(arrowstyle='<->', color='black', lw=1))
    plt.text(0.72, 0.2, "Loss giảm mạnh", fontsize=8, style='italic')

    # 4. Hình thức
    plt.title('Cơ chế điều hướng sự chú ý của Focal Loss so với Cross-Entropy', fontsize=12, fontweight='bold', pad=15)
    plt.xlabel('Xác suất dự báo đúng (p)', fontweight='bold')
    plt.ylabel('Giá trị Loss', fontweight='bold')
    plt.ylim(0, 5)
    plt.xlim(0, 1)
    plt.grid(True, linestyle=':', alpha=0.5)
    plt.legend(loc='upper right')
    
    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'focal_loss_comparison.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo thành công biểu đồ Focal Loss: {save_path}")

if __name__ == "__main__":
    generate_focal_loss_plot()
