import matplotlib.pyplot as plt
import numpy as np
import os

def format_value(val):
    if val >= 1000:
        return f'{val/1000:.0f}K'
    return str(val)

def generate_resampling_plot():
    # 1. Dữ liệu
    labels = ['0 (Rất thoáng)', '1 (Thoáng)', '2 (Hơi đông)', '3 (Đi chậm)', '4 (Ùn ứ)', '5 (Thảm họa)']
    original = [652873, 953849, 456981, 51366, 2367, 259]
    resampled = [205464, 250000, 205464, 51366, 30000, 22000]

    x = np.arange(len(labels))
    width = 0.35

    plt.figure(figsize=(12, 6), dpi=300)
    
    # 2. Vẽ cột
    rects1 = plt.bar(x - width/2, original, width, label='Dữ liệu Gốc (Original)', color='#D3D3D3', edgecolor='gray', alpha=0.8)
    rects2 = plt.bar(x + width/2, resampled, width, label='Dữ liệu Sau Cân Bằng (Hybrid Resampled)', color='#1F77B4', edgecolor='navy')

    # 3. Thang đo Log và Format
    plt.yscale('log')
    plt.ylabel('Số lượng mẫu (Thang đo Logarit)', fontweight='bold')
    plt.title('So sánh Phân phối dữ liệu Gốc và Phân phối Vàng sau khi áp dụng Cân bằng Lai (Log Scale)', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xticks(x, labels, fontweight='bold')
    plt.grid(axis='y', linestyle='--', alpha=0.3)

    # Thêm text trên đầu cột
    for rect in rects1:
        height = rect.get_height()
        plt.text(rect.get_x() + rect.get_width()/2., height, format_value(height),
                 ha='center', va='bottom', fontsize=9, color='gray')

    for rect in rects2:
        height = rect.get_height()
        plt.text(rect.get_x() + rect.get_width()/2., height, format_value(height),
                 ha='center', va='bottom', fontsize=9, fontweight='bold', color='#1F77B4')

    # 4. Chú thích (Annotations)
    
    # Đường cong bao quát (Dùng splines đơn giản hoặc nối các điểm)
    plt.plot(x + width/2, resampled, color='#1F77B4', linestyle='--', alpha=0.5, marker='o', markersize=4)
    plt.annotate('Bảo toàn Tính thứ bậc tự nhiên\n(Ordinal Hierarchy)', xy=(2.5, 60000), xytext=(3, 200000),
                 arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=-0.2"),
                 fontsize=10, color='#1F77B4', fontweight='bold', ha='center')

    # Mũi tên Bơm dữ liệu (Lớp 4 & 5)
    plt.annotate('Bơm dữ liệu thảm họa (CTGAN)', xy=(4.5, 25000), xytext=(5, 3000),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=6),
                 fontsize=10, fontweight='bold', color='red', ha='center')

    # Mũi tên Cắt tỉa (Lớp 0, 1, 2)
    plt.annotate('Cắt tỉa lớp đa số (Undersampling)', xy=(1, 150000), xytext=(1, 600000),
                 arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=6),
                 fontsize=10, fontweight='bold', color='darkgreen', ha='center')

    plt.legend(loc='upper right')
    plt.tight_layout()

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'resampling_comparison.png')
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo thành công biểu đồ so sánh: {save_path}")

if __name__ == "__main__":
    generate_resampling_plot()
