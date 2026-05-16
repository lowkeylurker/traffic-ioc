import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_correct_data_leakage_flowchart():
    # 1. Setup figure
    fig, ax = plt.subplots(figsize=(12, 11), facecolor='#1a1a1a')
    ax.set_facecolor('#1a1a1a')
    
    # Coordinates and dimensions
    # Vertical levels (y)
    L1, L2, L3, L4, L5 = 0.95, 0.78, 0.58, 0.38, 0.18
    # Horizontal positions (x)
    CENTER = 0.5
    LEFT = 0.25
    RIGHT = 0.75
    
    box_w, box_h = 0.32, 0.1
    
    def draw_box(x, y, text, edge_color='white', fill_color='#2c3e50', text_color='white', fontweight='normal'):
        # FancyBboxPatch for rounded corners
        box = patches.FancyBboxPatch(
            (x - box_w/2, y - box_h/2), box_w, box_h,
            boxstyle="round,pad=0.02",
            linewidth=2, edgecolor=edge_color, facecolor=fill_color,
            zorder=5
        )
        ax.add_patch(box)
        ax.text(x, y, text, color=text_color, ha='center', va='center', 
                fontsize=11, fontweight=fontweight, zorder=6)

    def draw_arrow(start, end, color='white', linestyle='-', zorder=2, label="", label_pos=0.5):
        ax.annotate("", xy=end, xytext=start,
                    arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", 
                                  color=color, linewidth=2, 
                                  linestyle=linestyle, mutation_scale=20),
                    xycoords='axes fraction', textcoords='axes fraction',
                    zorder=zorder)
        if label:
            lx = start[0] + (end[0] - start[0]) * label_pos
            ly = start[1] + (end[1] - start[1]) * label_pos
            ax.text(lx, ly, label, color=color, fontsize=10, fontweight='bold',
                    ha='center', va='center', bbox=dict(boxstyle="round,pad=0.2", fc="#1a1a1a", ec="none", alpha=0.8))

    # --- DRAW BOXES ---
    
    # Level 1: RAW DATASET
    draw_box(CENTER, L1, "RAW DATASET", fontweight='bold', edge_color='white')
    
    # Level 2: Train & Test Sets
    draw_box(LEFT, L2, "TẬP HUẤN LUYỆN\n(Train Set)", edge_color='#2ecc71', fontweight='bold')
    draw_box(RIGHT, L2, "TẬP KIỂM THỬ\n(Test Set)", edge_color='#e74c3c', fontweight='bold')
    
    # Level 3: Fit Process (ONLY under Train Set)
    draw_box(LEFT, L3, "Fit Process\nTập huấn tham số (µ, σ)\nCHỈ TRÊN TẬP TRAIN", edge_color='#2ecc71', fill_color='#1b4d31')
    
    # Level 4: Transform Boxes
    draw_box(LEFT, L4, "Transform Train Data", edge_color='#2ecc71')
    draw_box(RIGHT, L4, "Transform Test Data", edge_color='#e74c3c')
    
    # Level 5: Final Outputs
    draw_box(LEFT, L5, "Scaled Train Data\n(Ready for Training)", edge_color='#2ecc71', fill_color='#0e2b1b')
    draw_box(RIGHT, L5, "Scaled Test Data\n(Ready for Evaluation)", edge_color='#e74c3c', fill_color='#4d1b1b')
    
    # --- DRAW ARROWS ---
    
    arrow_color = 'black'
    
    # 1. RAW -> Train/Test
    draw_arrow((CENTER - 0.05, L1 - 0.05), (LEFT, L2 + 0.05), color=arrow_color)
    draw_arrow((CENTER + 0.05, L1 - 0.05), (RIGHT, L2 + 0.05), color=arrow_color)
    
    # 2. Train side: Train Set -> Fit Process
    draw_arrow((LEFT, L2 - 0.05), (LEFT, L3 + 0.05), color=arrow_color)
    
    # 3. CORRECT LOGIC: Fit Process -> Transform Train Data
    draw_arrow((LEFT, L3 - 0.05), (LEFT, L4 + 0.05), color='#f1c40f', label="Apply µ, σ")
    
    # 4. CORRECT LOGIC: Fit Process -> Transform Test Data (Cross-Isolation flow)
    # Using a curved yellow arrow for parameter transfer
    ax.annotate("", xy=(RIGHT, L4 + 0.05), xytext=(LEFT + 0.16, L3),
                arrowprops=dict(arrowstyle="->,head_width=0.4,head_length=0.6", 
                              color='#f1c40f', linewidth=2.5, 
                              connectionstyle="arc3,rad=-0.2"), zorder=7)
    
    # Label for the scaler transfer - centered on the arc
    ax.text(CENTER, L3 + 0.06, "µ, σ scaler.pkl", color='#f1c40f', fontweight='bold', 
            fontsize=11, ha='center', va='center',
            bbox=dict(boxstyle="round,pad=0.3", fc="#1a1a1a", ec="#f1c40f", alpha=1), zorder=8)
    
    # 5. Test side: Test Set -> Transform Test Data
    draw_arrow((RIGHT, L2 - 0.05), (RIGHT, L4 + 0.05), color=arrow_color)
    
    # 6. Final vertical flows
    draw_arrow((LEFT, L4 - 0.05), (LEFT, L5 + 0.05), color=arrow_color)
    draw_arrow((RIGHT, L4 - 0.05), (RIGHT, L5 + 0.05), color=arrow_color)
    
    # --- ISOLATION LINE ---
    # Draw vertical dashed line in background
    ax.plot([0.5, 0.5], [0.05, 0.85], color='grey', linestyle='--', linewidth=1.5, alpha=0.5, zorder=1)
    
    # "Strict Isolation" label - Higher up in clear space
    ax.text(0.5, 0.85, "Strict Isolation", color='white', ha='center', fontweight='bold', 
            fontsize=12, alpha=0.9,
            bbox=dict(boxstyle="round,pad=0.4", fc="#1a1a1a", ec="grey", alpha=1, linestyle='--'), zorder=8)

    # 5. Finalize
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    plt.axis('off')
    
    # Save the plot
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'data_leakage_diagram.png')
    plt.savefig(output_path, dpi=300, transparent=True, bbox_inches='tight')
    print(f"Corrected flowchart saved to {output_path}")

if __name__ == "__main__":
    draw_correct_data_leakage_flowchart()
