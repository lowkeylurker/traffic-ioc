import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_sliding_window():
    fig, ax = plt.subplots(figsize=(12, 5), dpi=300)
    ax.set_xlim(0, 20)
    ax.set_ylim(0, 6)
    ax.axis('off')

    # 1. Vẽ Trục thời gian (Time Axis)
    ax.annotate('', xy=(19, 2), xytext=(0.5, 2), arrowprops=dict(arrowstyle='->', lw=2, color='gray'))
    ax.text(19, 1.5, 'Thời gian (Time)', ha='right', fontsize=10, style='italic')

    # Vẽ các ô dữ liệu (t=1 to t=18)
    # t=8 và t=9 để trống
    missing_steps = [8, 9]
    for t in range(1, 19):
        if t in missing_steps:
            # Vẽ ô đứt đoạn (Missing)
            rect = patches.Rectangle((t - 0.4, 1.8), 0.8, 0.4, fc='none', ec='red', ls=':', lw=1, alpha=0.3)
            ax.add_patch(rect)
            ax.text(t, 2.5, '?', ha='center', color='red', alpha=0.5)
        else:
            # Vẽ ô dữ liệu chuẩn
            rect = patches.Rectangle((t - 0.4, 1.8), 0.8, 0.4, fc='#E2E2E2', ec='gray', lw=1)
            ax.add_patch(rect)
        
        ax.text(t, 1.3, f't={t}', ha='center', fontsize=8)

    # 2. Cửa sổ hợp lệ (t=1 to t=5, target t=6)
    # Khung cửa sổ trượt (window size = 5)
    valid_window = patches.FancyBboxPatch((0.5, 3.2), 4.6, 1.2, boxstyle="round,pad=0.1", 
                                          fc='none', ec='green', lw=2.5, label='Valid')
    ax.add_patch(valid_window)
    ax.text(2.8, 4.6, 'Cửa sổ Hợp lệ (Valid Sequence)', ha='center', color='green', fontweight='bold', fontsize=10)
    
    # Target t=6
    ax.add_patch(patches.Rectangle((5.6, 1.8), 0.8, 0.4, fc='orange', ec='darkorange', lw=2))
    ax.annotate('Target', xy=(6, 2.3), xytext=(6, 3.5), ha='center',
                arrowprops=dict(arrowstyle='->', color='orange', lw=2))
    ax.text(6, 3.7, 'Label', ha='center', color='darkorange', fontweight='bold')

    # 3. Cửa sổ bị loại bỏ (t=6 to t=10)
    # Khung này chứa t=8, t=9 bị thiếu
    invalid_window = patches.FancyBboxPatch((5.5, 3.2), 4.6, 1.2, boxstyle="round,pad=0.1", 
                                            fc='none', ec='red', ls='--', lw=2.5)
    ax.add_patch(invalid_window)
    ax.text(7.8, 4.6, 'Loại bỏ do đứt gãy thời gian\n(Missing Data)', ha='center', color='red', fontweight='bold', fontsize=10)
    
    # Vẽ chữ X lớn
    ax.text(7.8, 3.8, '✘', ha='center', va='center', color='red', fontsize=40, alpha=0.8)

    # Tiêu đề
    plt.title('Cơ chế Cửa sổ trượt (Sliding Window) và Thuật toán kiểm tra tính liên tục', 
              fontsize=14, fontweight='bold', pad=30)
    
    # Chú thích
    ax.text(1, 0.2, "* Nguyên tắc: Mô hình chỉ học từ các chuỗi thời gian liên tục. Mọi cửa sổ chứa dữ liệu rác/thiếu sẽ bị hệ thống tự động loại bỏ.", 
            fontsize=9, style='italic', color='gray')

    # 4. Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'sliding_window_mechanism.png')

    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Sơ đồ Sliding Window đã được lưu tại: {save_path}")

if __name__ == "__main__":
    draw_sliding_window()
