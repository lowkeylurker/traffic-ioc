import matplotlib.pyplot as plt
import numpy as np
import os

def draw_asymmetric_penalty_academic():
    # 1. Cấu hình style Academic (Light Mode)
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['axes.facecolor'] = 'white'
    plt.rcParams['figure.facecolor'] = 'white'
    plt.rcParams['grid.color'] = '#e0e0e0'
    plt.rcParams['grid.linestyle'] = '-'
    plt.rcParams['grid.alpha'] = 0.7
    
    fig, ax = plt.subplots(figsize=(12, 7), dpi=300)
    
    # 2. Dữ liệu
    labels = ['Báo giả\n(False Positive)', 'Bỏ sót kẹt xe\n(False Negative)']
    penalties = [10, 150]
    colors = ['#f0ad4e', '#d9534f'] # Màu Yellow và Red chuẩn academic
    
    # Vẽ các cột
    bars = ax.bar(labels, penalties, color=colors, width=0.5, edgecolor='black', linewidth=1.2, alpha=0.9)
    
    # Thêm giá trị trên đầu cột
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height + 3,
                f'-{height}', ha='center', va='bottom', color='black', 
                fontsize=14, fontweight='bold')

    # 3. Định dạng trục và Tiêu đề
    ax.set_title("Đặc tính Hàm Phạt Không Đối Xứng (Asymmetric Penalty)\nChiến lược tối ưu hóa ưu tiên An toàn (Safety-First)", 
                 color='#333333', fontsize=18, fontweight='bold', pad=30)
    ax.set_ylabel("Mức độ Phạt (Penalty Value)", color='#555555', fontsize=12, labelpad=15)
    
    ax.tick_params(axis='x', colors='black', labelsize=12)
    ax.tick_params(axis='y', colors='#555555', labelsize=10)
    
    ax.set_ylim(0, 200)
    
    # Loại bỏ các đường viền thừa
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#888888')
    ax.spines['bottom'].set_color('#888888')
    
    ax.grid(axis='y', zorder=0)
    
    # 4. Chú thích chuyên nghiệp (Annotation)
    # Chú thích cho False Negative
    ax.annotate('HẬU QUẢ NGHIÊM TRỌNG\n(Gây tắc nghẽn diện rộng)', 
                xy=(1, 150), xytext=(1.4, 175),
                arrowprops=dict(facecolor='#d9534f', shrink=0.05, width=2, headwidth=10),
                color='#d9534f', fontsize=12, fontweight='bold', ha='center',
                bbox=dict(boxstyle="round,pad=0.5", fc="white", ec="#d9534f", alpha=1))
    
    # Chú thích cho False Positive
    ax.annotate('RỦI RO THẤP\n(Có thể chấp nhận)', 
                xy=(0, 10), xytext=(-0.4, 45),
                arrowprops=dict(facecolor='#f0ad4e', shrink=0.05, width=2, headwidth=10),
                color='#f0ad4e', fontsize=11, ha='center',
                bbox=dict(boxstyle="round,pad=0.5", fc="white", ec="#f0ad4e", alpha=1))

    # Đường kẻ ngang thể hiện sự chênh lệch
    ax.axhline(y=10, color='#f0ad4e', linestyle='--', alpha=0.5, linewidth=1)
    ax.text(1.5, 12, "Mức phạt cơ sở", color='#f0ad4e', fontsize=10, alpha=0.8, ha='right')

    # Banner nhấn mạnh Triết lý
    plt.text(0.5, -45, "Triết lý: Phạt nặng lỗi Bỏ sót để ép mô hình học cách bảo vệ luồng giao thông", 
             color='#1b5e20', fontsize=13, fontweight='bold', ha='center',
             bbox=dict(boxstyle="round,pad=0.6", fc="#e8f5e9", ec="#2e7d32", alpha=1))

    # 5. Lưu file
    plt.tight_layout()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'asymmetric_penalty_concept.png')
    plt.savefig(output_path, dpi=300, transparent=False) # Tắt transparent để có nền trắng chuẩn
    print(f"Diagram saved to {output_path}")

if __name__ == "__main__":
    draw_asymmetric_penalty_academic()
