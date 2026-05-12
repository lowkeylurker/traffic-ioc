import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_lstm_cell():
    fig, ax = plt.subplots(figsize=(12, 8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 7)
    ax.axis('off')

    # Màu sắc Pastel chuyên nghiệp
    colors = {
        'gate': '#FAD0C4',      # Hồng nhạt cho các cổng
        'op': '#CFD9DF',        # Xám xanh cho các phép toán
        'state': '#A1C4FD',     # Xanh dương nhạt cho Cell State
        'hidden': '#C2E9FB',    # Xanh cyan nhạt cho Hidden State
        'input': '#E2E2E2'      # Xám nhạt cho Input
    }

    # 1. Vẽ khung tế bào chính
    cell_box = patches.FancyBboxPatch((1.5, 1), 7, 5, boxstyle="round,pad=0.3", 
                                      ec="gray", fc="white", ls="--", lw=2, alpha=0.5)
    ax.add_patch(cell_box)
    ax.text(5, 0.5, "LSTM Cell ($t$)", fontsize=14, ha='center', fontweight='bold', alpha=0.6)

    # 2. Các cổng (Gates) - Hình chữ nhật bo góc
    # Forget Gate (f)
    ax.add_patch(patches.FancyBboxPatch((2.5, 2.5), 0.8, 0.8, boxstyle="round,pad=0.1", fc=colors['gate'], ec='gray'))
    ax.text(2.9, 2.9, r'$\sigma$', fontsize=15, ha='center', va='center')
    ax.text(2.9, 2.2, 'Forget\nGate', fontsize=9, ha='center')

    # Input Gate (i & g)
    ax.add_patch(patches.FancyBboxPatch((4.0, 2.5), 0.8, 0.8, boxstyle="round,pad=0.1", fc=colors['gate'], ec='gray'))
    ax.text(4.4, 2.9, r'$\sigma$', fontsize=15, ha='center', va='center')
    
    ax.add_patch(patches.FancyBboxPatch((5.2, 2.5), 0.8, 0.8, boxstyle="round,pad=0.1", fc=colors['gate'], ec='gray'))
    ax.text(5.6, 2.9, r'$\tanh$', fontsize=12, ha='center', va='center')
    ax.text(4.8, 2.2, 'Input Gate', fontsize=9, ha='center')

    # Output Gate (o)
    ax.add_patch(patches.FancyBboxPatch((7.2, 2.5), 0.8, 0.8, boxstyle="round,pad=0.1", fc=colors['gate'], ec='gray'))
    ax.text(7.6, 2.9, r'$\sigma$', fontsize=15, ha='center', va='center')
    ax.text(7.6, 2.2, 'Output\nGate', fontsize=9, ha='center')

    # 3. Các phép toán (Operations) - Hình tròn
    # Pointwise Multiplication (x)
    ops = [
        (2.9, 5.5, r'$\otimes$'), # C_{t-1} * f_t
        (4.8, 4.0, r'$\otimes$'), # i_t * g_t
        (4.8, 5.5, r'$\oplus$'),  # Update Cell State
        (8.5, 4.5, r'$\otimes$')  # h_t output
    ]
    for x, y, txt in ops:
        ax.add_patch(plt.Circle((x, y), 0.25, fc=colors['op'], ec='gray'))
        ax.text(x, y, txt, fontsize=15, ha='center', va='center')

    # Tanh sau Cell State
    ax.add_patch(patches.FancyBboxPatch((8.1, 5.3), 0.8, 0.4, boxstyle="round,pad=0.1", fc=colors['op'], ec='gray'))
    ax.text(8.5, 5.5, r'$\tanh$', fontsize=10, ha='center', va='center')

    # 4. Đường truyền (Flows)
    # Cell State Flow (C)
    ax.annotate('', xy=(10, 5.5), xytext=(0, 5.5), arrowprops=dict(arrowstyle='->', color=colors['state'], lw=3))
    ax.text(0.5, 5.7, r'$C_{t-1}$', fontsize=12)
    ax.text(9.5, 5.7, r'$C_{t}$', fontsize=12)

    # Hidden State Flow (h)
    ax.annotate('', xy=(10, 1.5), xytext=(0, 1.5), arrowprops=dict(arrowstyle='->', color=colors['hidden'], lw=2))
    ax.text(0.5, 1.7, r'$h_{t-1}$', fontsize=12)
    ax.text(9.5, 1.7, r'$h_{t}$', fontsize=12)

    # Input x_t
    ax.annotate('', xy=(5, 1), xytext=(5, 0), arrowprops=dict(arrowstyle='->', lw=2))
    ax.text(5.2, 0.2, r'$x_t$', fontsize=12)

    # Connections nội bộ
    # h_{t-1} to gates
    ax.plot([1, 1, 7.6], [1.5, 2.5, 2.5], color='gray', lw=1, alpha=0.5)
    ax.plot([2.9, 2.9], [2.5, 1.5], color='gray', lw=1, alpha=0.5, ls=':')
    ax.plot([4.4, 4.4], [2.5, 1.5], color='gray', lw=1, alpha=0.5, ls=':')
    ax.plot([5.6, 5.6], [2.5, 1.5], color='gray', lw=1, alpha=0.5, ls=':')

    # Gates to Cell State
    ax.plot([2.9, 2.9], [3.3, 5.25], color='gray', lw=1.5)
    ax.plot([4.8, 4.8], [4.25, 5.25], color='gray', lw=1.5)
    ax.plot([4.4, 4.8], [3.3, 3.75], color='gray', lw=1.5)
    ax.plot([5.6, 4.8], [3.3, 3.75], color='gray', lw=1.5)

    # Cell State to h_t
    ax.plot([8.5, 8.5], [5.5, 5.7], color='gray', lw=1)
    ax.plot([8.5, 8.5], [5.3, 4.75], color='gray', lw=1)
    ax.plot([7.6, 8.25], [3.3, 4.5], color='gray', lw=1)
    ax.plot([8.75, 9.2, 9.2], [4.5, 4.5, 1.5], color='gray', lw=1.5)

    # 5. Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'lstm_architecture.png')

    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Sơ đồ LSTM đã được lưu tại: {save_path}")

if __name__ == "__main__":
    draw_lstm_cell()
