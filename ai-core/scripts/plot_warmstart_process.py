import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_warmstart_process():
    # Setup Academic Style (Light Mode)
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['axes.facecolor'] = 'white'
    plt.rcParams['figure.facecolor'] = 'white'
    
    fig, ax = plt.subplots(figsize=(14, 7), dpi=300)
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 8)
    plt.axis('off')

    # Utility for rounded boxes
    def draw_box(x, y, w, h, label, color, text_color='black', fontsize=11, fontweight='bold'):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.2", 
                                      linewidth=1.5, edgecolor=color, facecolor='white', zorder=3)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, label, ha='center', va='center', 
                color=text_color, fontsize=fontsize, fontweight=fontweight, zorder=4)

    # --- PHASE 1: SUPERVISED PRE-TRAINING ---
    # Bounding box for Phase 1
    p1_bg = patches.Rectangle((0.5, 0.5), 5.5, 6.5, linewidth=1, edgecolor='#bdc3c7', 
                              facecolor='#f8f9fa', linestyle='--', zorder=1)
    ax.add_patch(p1_bg)
    ax.text(3.25, 7.2, "PHA 1: SUPERVISED PRE-TRAINING", fontsize=14, fontweight='bold', color='#34495e', ha='center')

    draw_box(1, 3, 2, 1.5, "Dữ liệu Lịch sử\n(Historical Data)", "#7f8c8d")
    draw_box(4, 3, 2, 1.5, "Mạng Phân loại\n(SL Backbone)", "#3498db", text_color="#2980b9")
    
    # Arrow P1
    ax.annotate("", xy=(4, 3.75), xytext=(3, 3.75),
                arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", color='#34495e', lw=2))

    # --- WEIGHT TRANSFER BRIDGE ---
    # The "Knowledge Bridge"
    bridge_x = 6
    bridge_y = 3.75
    ax.annotate("CHUYỂN GIAO TRỌNG SỐ\n(Weight Transfer)", xy=(8, bridge_y), xytext=(6, 5),
                arrowprops=dict(arrowstyle="fancy,tail_width=0.8,head_width=1.5,head_length=1.5", 
                                color='#27ae60', connectionstyle="arc3,rad=.3"),
                fontsize=11, fontweight='bold', color='#27ae60', ha='center',
                bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#27ae60", alpha=1, lw=1.5), zorder=5)

    # --- PHASE 2: REINFORCEMENT LEARNING ---
    # Bounding box for Phase 2
    p2_bg = patches.Rectangle((8, 0.5), 5.5, 6.5, linewidth=1, edgecolor='#bdc3c7', 
                              facecolor='#f8f9fa', linestyle='--', zorder=1)
    ax.add_patch(p2_bg)
    ax.text(10.75, 7.2, "PHA 2: REINFORCEMENT LEARNING", fontsize=14, fontweight='bold', color='#34495e', ha='center')

    draw_box(8.5, 3, 2, 1.5, "Đặc vụ DQN\n(DQN Backbone)", "#2ecc71", text_color="#27ae60")
    draw_box(11.5, 3, 1.5, 1.5, "Môi trường\nGiao thông", "#e67e22")

    # RL Loop Arrows
    # Action
    ax.annotate("Hành động (Action)", xy=(11.5, 4), xytext=(10.5, 4),
                arrowprops=dict(arrowstyle="->,head_width=0.3", color='#34495e', lw=1.5))
    # Feedback
    ax.annotate("Trạng thái, Thưởng", xy=(10.5, 3.5), xytext=(11.5, 3.5),
                arrowprops=dict(arrowstyle="->,head_width=0.3", color='#34495e', lw=1.5))

    # Info Labels
    ax.text(3.25, 1, "Học từ các kịch bản\nquá khứ (Static)", ha='center', fontsize=10, color='#7f8c8d')
    ax.text(10.75, 1, "Tối ưu hóa chiến lược qua\ntương tác (Dynamic)", ha='center', fontsize=10, color='#7f8c8d')

    plt.tight_layout()
    
    # Save
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'warmstart_process.png')
    plt.savefig(output_path, dpi=300)
    print(f"Diagram saved to {output_path}")

if __name__ == "__main__":
    draw_warmstart_process()
