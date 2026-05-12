import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_fusion_architecture():
    fig, ax = plt.subplots(figsize=(14, 8), dpi=300)
    ax.set_xlim(0, 17)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # Màu sắc phong cách chuyên nghiệp
    colors = {
        'input': '#E8EAED',      # Xám nhạt cho đầu vào
        'dynamic': '#A1C4FD',    # Xanh dương cho LSTM
        'cat': '#FAD0C4',        # Hồng nhạt cho Embedding
        'static': '#D4FC79',     # Xanh lá nhạt cho FNN
        'merge': '#CFD9DF',      # Xám xanh cho Concatenate
        'output': '#FFD194'      # Cam nhạt cho Q-Values
    }

    # Helper function vẽ khối
    def draw_block(x, y, w, h, text, color, subtext=""):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.2", 
                                      fc=color, ec='gray', lw=1.5)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=11, fontweight='bold')
        if subtext:
            ax.text(x + w/2, y - 0.4, subtext, ha='center', va='top', fontsize=9, style='italic', alpha=0.7)

    # 1. Các Luồng Input (Bên trái)
    # Dynamic
    draw_block(1, 7, 2.5, 1.2, "Dynamic Input\n(Traffic Speed/Flow)", colors['input'])
    ax.annotate('', xy=(4.5, 7.6), xytext=(3.5, 7.6), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_block(4.5, 7, 3, 1.2, "LSTM Layer", colors['dynamic'], "(2 layers, hidden=64)")

    # Categorical
    draw_block(1, 4.4, 2.5, 1.2, "Categorical Input\n(Segment/Ward IDs)", colors['input'])
    ax.annotate('', xy=(4.5, 5), xytext=(3.5, 5), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_block(4.5, 4.4, 3, 1.2, "Spatial Embedding", colors['cat'], "(dim=8)")

    # Static
    draw_block(1, 1.8, 2.5, 1.2, "Static Input\n(Coordinates/Params)", colors['input'])
    ax.annotate('', xy=(4.5, 2.4), xytext=(3.5, 2.4), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_block(4.5, 1.8, 3, 1.2, "Feed-Forward (FNN)", colors['static'], "(Linear + ReLU)")

    # 2. Khối Hợp nhất (Merge)
    draw_block(8.5, 4.4, 1.5, 1.2, "Concatenate", colors['merge'])
    
    # Mũi tên từ 3 nhánh về Concatenate
    ax.annotate('', xy=(8.5, 5), xytext=(7.5, 7.6), arrowprops=dict(arrowstyle='->', lw=1.5, connectionstyle="angle,angleA=0,angleB=90"))
    ax.annotate('', xy=(8.5, 5), xytext=(7.5, 5), arrowprops=dict(arrowstyle='->', lw=1.5))
    ax.annotate('', xy=(8.5, 5), xytext=(7.5, 2.4), arrowprops=dict(arrowstyle='->', lw=1.5, connectionstyle="angle,angleA=0,angleB=-90"))

    # 3. Classifier & Output (Bên phải)
    ax.annotate('', xy=(10.8, 5), xytext=(10, 5), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_block(10.8, 4.4, 2, 1.2, "Fully Connected\nLayers", colors['merge'], "(Dropout + ReLU)")
    
    ax.annotate('', xy=(13.6, 5), xytext=(12.8, 5), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_block(13.6, 4.4, 1.8, 1.2, "Q-Values\n(6 Classes)", colors['output'], "(Output Layer)")

    # Tiêu đề
    plt.title("Sơ đồ kiến trúc mạng Fusion (Context-Aware Hybrid Architecture)", 
              fontsize=16, fontweight='bold', pad=20)
    
    # Legend/Note
    ax.text(1, 0.5, "* Ghi chú: Mô hình kết hợp đặc trưng động (chuỗi thời gian) và đặc trưng tĩnh (ngữ cảnh không gian) để dự báo.", 
            fontsize=10, style='italic', color='gray')

    # Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'fusion_network_arch.png')

    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Sơ đồ Fusion Arch đã được lưu tại: {save_path}")

if __name__ == "__main__":
    draw_fusion_architecture()
