import matplotlib.pyplot as plt
import numpy as np
import os

def plot_cyclical_time():
    # 1. Cấu hình Figure và Subplot với tỷ lệ 1:1 tuyệt đối
    fig = plt.figure(figsize=(8, 8), dpi=300)
    ax = fig.add_subplot(111)
    
    # 2. Tạo dữ liệu vòng tròn 24h
    t = np.linspace(0, 24, 1000)
    x = np.sin(2 * np.pi * t / 24)
    y = np.cos(2 * np.pi * t / 24)
    ax.plot(x, y, color='blue', alpha=0.2, ls='--', lw=1)

    # 3. Đánh dấu các mốc giờ chính (Đẩy xa hơn một chút để thoáng)
    hours = [0, 6, 12, 18]
    labels = ["00:00 / 24:00", "06:00", "12:00", "18:00"]
    # Tọa độ đẩy nhãn: (x_offset, y_offset)
    offsets = [(0, 0.18), (0.25, 0), (0, -0.25), (-0.25, 0)]
    
    for hr, label, (ox, oy) in zip(hours, labels, offsets):
        hx = np.sin(2 * np.pi * hr / 24)
        hy = np.cos(2 * np.pi * hr / 24)
        ax.scatter(hx, hy, color='black', s=60, zorder=5)
        # Căn chỉnh ha, va dựa trên vị trí
        ha = 'center' if ox == 0 else ('left' if ox > 0 else 'right')
        va = 'center' if oy == 0 else ('bottom' if oy > 0 else 'top')
        ax.text(hx + ox, hy + oy, label, ha=ha, va=va, fontweight='bold', fontsize=11)

    # 4. Đánh dấu điểm nhấn 23:00 và 01:00
    # 23:00
    x23, y23 = np.sin(2 * np.pi * 23 / 24), np.cos(2 * np.pi * 23 / 24)
    ax.scatter(x23, y23, color='orange', s=120, zorder=10, ec='black', lw=0.5)
    
    # 01:00
    x01, y01 = np.sin(2 * np.pi * 1 / 24), np.cos(2 * np.pi * 1 / 24)
    ax.scatter(x01, y01, color='red', s=120, zorder=10, ec='black', lw=0.5)

    # Vẽ đường cung kết nối (Màu xanh lá đậm)
    t_arc = np.linspace(23, 25, 50)
    ax.plot(np.sin(2 * np.pi * t_arc / 24), np.cos(2 * np.pi * t_arc / 24), 
            color='green', ls='-', lw=4, zorder=8)
    ax.text(0, 1.25, "Khoảng cách rất nhỏ (Liên tục)", color='green', 
             ha='center', va='bottom', fontweight='bold', fontsize=11)

    # 5. Thiết lập trục và thẩm mỹ
    ax.set_aspect('equal')
    ax.set_xlim(-1.6, 1.6)
    ax.set_ylim(-1.8, 1.8) # Dành khoảng trống bên dưới cho hộp thoại
    
    ax.axhline(0, color='black', lw=1, alpha=0.1)
    ax.axvline(0, color='black', lw=1, alpha=0.1)
    ax.grid(True, ls=':', alpha=0.3)
    
    ax.set_xlabel('Time_Sin (Giá trị Sine)', fontweight='bold', labelpad=15)
    ax.set_ylabel('Time_Cos (Giá trị Cosine)', fontweight='bold', labelpad=15)
    
    plt.title('Kỹ thuật chiếu trục thời gian 24h lên không gian chu kỳ Sin/Cos', 
              fontsize=14, fontweight='bold', pad=45)

    # 6. Thêm hộp thoại giải thích (Cố định vị trí an toàn)
    props = dict(boxstyle='round,pad=0.5', facecolor='wheat', alpha=0.4, edgecolor='orange')
    explanation = ("ƯU ĐIỂM: Việc dùng Sin/Cos giúp thời điểm 23h và 1h sáng\n"
                   "kế cận nhau trên vòng tròn hình học, giúp mô hình LSTM\n"
                   "học được tính liên tục của thời gian qua các ngày.")
    # Đặt ở tọa độ trục tuyệt đối để không bị lệch
    ax.text(0, -1.95, explanation, fontsize=10, bbox=props, ha='center', va='top', transform=ax.transData)

    # 7. Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'cyclical_time_encoding.png')

    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Ảnh Cyclical Encoding đã được cập nhật thành công tại: {save_path}")

if __name__ == "__main__":
    plot_cyclical_time()
