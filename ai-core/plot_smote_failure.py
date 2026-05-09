import matplotlib.pyplot as plt
import numpy as np
import os

def generate_smote_failure_plot():
    # 1. Thiết lập hệ tọa độ
    plt.figure(figsize=(8, 6), dpi=300)
    
    # Tạo đường cong vật lý (Fundamental Diagram of Traffic Flow)
    # Giả sử hàm Speed = V_max * (1 - (Density/Density_max)^2)
    density = np.linspace(0, 100, 100)
    speed = 80 * (1 - (density / 100)**2)
    
    plt.plot(density, speed, color='#D3D3D3', linewidth=3, label='Quy luật vật lý thực tế (Physical Boundary)')

    # 2. Điểm dữ liệu THỰC (A và B) ở vùng mật độ cao
    x_real = [70, 95]
    y_real = [80 * (1 - (x / 100)**2) for x in x_real]
    
    plt.scatter(x_real, y_real, color='#1F77B4', s=100, zorder=5, label='Dữ liệu thực tế (Real Samples)')
    plt.text(x_real[0]-2, y_real[0]+5, 'A', fontsize=12, fontweight='bold', color='#1F77B4')
    plt.text(x_real[1]-2, y_real[1]+5, 'B', fontsize=12, fontweight='bold', color='#1F77B4')

    # 3. Mô phỏng SMOTE (Nội suy tuyến tính)
    # Đường thẳng nối A và B
    plt.plot(x_real, y_real, color='red', linestyle='--', linewidth=2, label='Nội suy SMOTE (Linear Interpolation)')
    
    # Các điểm ảo X
    x_smote = [78, 87]
    y_smote = np.interp(x_smote, x_real, y_real)
    plt.scatter(x_smote, y_smote, color='red', marker='x', s=100, linewidth=2, zorder=6, label='Dữ liệu ảo (SMOTE Hallucinations)')

    # 4. Annotation và Điểm nhấn
    # Khoanh vùng lỗi
    circle = plt.Circle(((x_smote[0]+x_smote[1])/2, (y_smote[0]+y_smote[1])/2), 7, 
                        color='red', fill=False, linestyle=':', linewidth=2, alpha=0.6)
    plt.gca().add_patch(circle)

    # Chú thích mũi tên
    plt.annotate('Trạng thái Ảo giác Phi vật lý\n(Nằm ngoài quy luật tự nhiên)', 
                 xy=((x_smote[0]+x_smote[1])/2, (y_smote[0]+y_smote[1])/2), 
                 xytext=(30, 20),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=8),
                 fontsize=10, fontweight='bold', color='red', ha='center',
                 bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="red", lw=1, alpha=0.9))

    # 5. Hình thức
    plt.title('Sự vi phạm ràng buộc phi tuyến của phương pháp nội suy SMOTE', 
              fontsize=12, fontweight='bold', pad=15)
    plt.xlabel('Mật độ xe (Density)', fontweight='bold')
    plt.ylabel('Vận tốc (Speed - km/h)', fontweight='bold')
    plt.xlim(0, 110)
    plt.ylim(0, 100)
    plt.grid(True, linestyle=':', alpha=0.5)
    plt.legend(loc='lower left', fontsize=9)
    
    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'smote_failure_hallucination.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo thành công minh chứng thất bại SMOTE: {save_path}")

if __name__ == "__main__":
    generate_smote_failure_plot()
