import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def plot_asymmetric_reward():
    # 1. Chuẩn bị dữ liệu
    # Trục X: Sai lệch (Thực tế - Dự báo)
    x_labels = ['-1\n(Báo hơi quá)', '0\n(Đoán chuẩn)', '+1\n(Báo hơi thiếu)', '+4\n(Bỏ sót\nKẹt xe)', '+5\n(Bỏ sót\nVỡ trận)']
    
    # Cập nhật mức thưởng/phạt mới: Thưởng +15, Phạt bỏ lọt giảm xuống -10
    rewards = [-1, 15, -1, -10, -10]
    
    # Màu sắc tương ứng: Đổi vùng phạt nặng sang màu TÍM (Purple/Violet)
    colors = ['#FAD0C4', '#D4FC79', '#FAD0C4', '#8E44AD', '#7D3C98']

    # 2. Cấu hình biểu đồ
    plt.figure(figsize=(8, 5), dpi=300)
    sns.set_theme(style="whitegrid")
    
    # Vẽ biểu đồ cột
    bars = plt.bar(x_labels, rewards, color=colors, edgecolor='gray', linewidth=1.2, width=0.6)

    # 3. Thêm các đường hỗ trợ
    plt.axhline(0, color='black', linewidth=1.5) # Đường baseline y=0
    
    # Thêm nhãn giá trị trên đầu/dưới mỗi cột
    for bar in bars:
        yval = bar.get_height()
        va = 'bottom' if yval > 0 else 'top'
        plt.text(bar.get_x() + bar.get_width()/2, yval + (0.5 if yval > 0 else -0.5), 
                 f'{yval:+d}', ha='center', va=va, fontweight='bold', fontsize=12)

    # 4. Trang trí
    plt.title('Mô phỏng Hàm phần thưởng không đối xứng\n(Asymmetric Reward Shaping)', 
              fontsize=14, fontweight='bold', pad=20)
    plt.xlabel('Mức độ sai lệch dự báo (Thực tế - Dự báo)', fontsize=11, fontweight='bold')
    plt.ylabel('Điểm thưởng / Phạt (Reward)', fontsize=11, fontweight='bold')
    
    # Thiết lập giới hạn trục Y
    plt.ylim(-15, 20)

    # Thêm vùng nhấn mạnh "Vùng nguy hiểm" - Màu Tím
    plt.text(3.5, -5, "VÙNG PHẠT NẶNG\n(Fatal False Negative)", color='#8E44AD', 
             ha='center', va='center', fontweight='bold', style='italic', alpha=0.7)

    # 5. Lưu ảnh
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'asymmetric_reward.png')

    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Biểu đồ Reward Shaping đã được lưu tại: {save_path}")

if __name__ == "__main__":
    plot_asymmetric_reward()
