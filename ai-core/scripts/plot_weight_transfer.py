import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, ConnectionPatch
import os

def draw_weight_transfer_diagram():
    # 1. Setup figure
    fig, ax = plt.subplots(figsize=(16, 9), facecolor='#1a1a1a')
    ax.set_facecolor('#1a1a1a')
    
    # Coordinates for boxes and phases
    # Vertical center for all main boxes
    Y_CENTER = 0.45
    
    # Phase boxes dimensions
    PHASE_W = 0.46
    PHASE_H = 0.55
    PHASE_Y = 0.15
    
    # Specific box coordinates (Center points)
    X_HIST = 0.12
    X_PRETRAIN = 0.38
    X_DQN = 0.62
    X_ENV = 0.88
    
    # Box dimensions
    BOX_W = 0.20
    BOX_H = 0.14
    
    def draw_rounded_box(x, y, text, edge_color='white', fill_color='#2c3e50', text_color='white', fontweight='normal', lw=2):
        box = FancyBboxPatch(
            (x - BOX_W/2, y - BOX_H/2), BOX_W, BOX_H,
            boxstyle="round,pad=0.02",
            linewidth=lw, edgecolor=edge_color, facecolor=fill_color,
            zorder=5
        )
        ax.add_patch(box)
        ax.text(x, y, text, color=text_color, ha='center', va='center', 
                fontsize=11, fontweight=fontweight, zorder=6)
        return box

    # --- DRAW PHASES (Bounding Boxes) ---
    phase1_box = patches.Rectangle((0.02, PHASE_Y), PHASE_W, PHASE_H, 
                                 linewidth=2, edgecolor='#555555', facecolor='none', 
                                 linestyle='--', alpha=0.5, zorder=1)
    ax.add_patch(phase1_box)
    ax.text(0.02 + PHASE_W/2, PHASE_Y + PHASE_H + 0.08, "PHA 1: SUPERVISED PRE-TRAINING", 
            color='white', ha='center', va='center', fontsize=15, fontweight='bold', alpha=0.9)

    phase2_box = patches.Rectangle((0.52, PHASE_Y), PHASE_W, PHASE_H, 
                                 linewidth=2, edgecolor='#555555', facecolor='none', 
                                 linestyle='--', alpha=0.5, zorder=1)
    ax.add_patch(phase2_box)
    ax.text(0.52 + PHASE_W/2, PHASE_Y + PHASE_H + 0.08, "PHA 2: REINFORCEMENT LEARNING", 
            color='white', ha='center', va='center', fontsize=15, fontweight='bold', alpha=0.9)

    # --- DRAW BOXES INSIDE PHASE 1 ---
    draw_rounded_box(X_HIST, Y_CENTER, "Dữ liệu Lịch sử\n(Historical Traffic Data)", edge_color='#7f8c8d')
    draw_rounded_box(X_PRETRAIN, Y_CENTER, "Mạng Giám sát\n(Pre-trained Backbone)", edge_color='#3498db', fontweight='bold', lw=3)
    
    # Arrow Phase 1
    ax.annotate("", xy=(X_PRETRAIN - BOX_W/2 - 0.005, Y_CENTER), xytext=(X_HIST + BOX_W/2 + 0.005, Y_CENTER),
                arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", color='white', linewidth=2), zorder=4)

    # --- DRAW BOXES INSIDE PHASE 2 ---
    draw_rounded_box(X_DQN, Y_CENTER, "Mạng DQN\n(DQN Backbone)", edge_color='#3498db', fontweight='bold', lw=3)
    draw_rounded_box(X_ENV, Y_CENTER, "Môi trường Giao thông\n(Traffic Environment)", edge_color='#e67e22')
    
    # RL Interaction Arrows (Arc style for clarity)
    # Action arrow (Top)
    ax.annotate("Action", xy=(X_ENV - BOX_W/2, Y_CENTER + 0.06), xytext=(X_DQN + BOX_W/2, Y_CENTER + 0.12),
                arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", color='#e67e22', linewidth=2, 
                              connectionstyle="arc3,rad=-0.4"), 
                color='white', fontsize=11, ha='center', va='bottom', zorder=10)
    # State/Reward arrow (Bottom)
    ax.annotate("State, Reward", xy=(X_DQN + BOX_W/2, Y_CENTER - 0.06), xytext=(X_ENV - BOX_W/2, Y_CENTER - 0.12),
                arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", color='#2ecc71', linewidth=2, 
                              connectionstyle="arc3,rad=-0.4"),
                color='white', fontsize=11, ha='center', va='top', zorder=10)

    # --- WEIGHT TRANSFER ARROW ---
    ax.annotate("", xy=(X_DQN - BOX_W/2 - 0.02, Y_CENTER), xytext=(X_PRETRAIN + BOX_W/2 + 0.02, Y_CENTER),
                arrowprops=dict(arrowstyle="fancy,head_length=1.5,head_width=1.5", 
                              color='#deff9a', linewidth=10, 
                              alpha=0.9, mutation_scale=30), zorder=10)
    
    # Label for weight transfer
    ax.text((X_PRETRAIN + X_DQN)/2, Y_CENTER + 0.18, "Chuyển giao Trọng số\n(Weight Transfer)", 
            color='#deff9a', fontsize=14, fontweight='bold', ha='center', va='center',
            bbox=dict(boxstyle="round,pad=0.5", fc="#1a1a1a", ec="#deff9a", alpha=1, lw=2), zorder=11)

    # Final settings
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    plt.axis('off')
    
    # Save path detection
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'weight_transfer_diagram.png')
    # Save without bbox_inches='tight' to avoid cropping the top labels
    plt.savefig(output_path, dpi=300, transparent=True, facecolor='#1a1a1a')
    print(f"Diagram saved to {output_path}")

if __name__ == "__main__":
    draw_weight_transfer_diagram()
