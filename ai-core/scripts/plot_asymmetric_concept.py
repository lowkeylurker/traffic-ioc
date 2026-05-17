import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import os

def draw_asymmetric_balance_concept():
    # Setup Academic Style (Light Mode)
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['axes.facecolor'] = 'white'
    plt.rcParams['figure.facecolor'] = 'white'
    
    fig, ax = plt.subplots(figsize=(12, 8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8)
    plt.axis('off')

    # --- DRAW THE BALANCE SCALE ---
    # 1. The Pivot (Base)
    pivot_x, pivot_y = 5, 2
    triangle = patches.Polygon([[pivot_x-0.5, pivot_y-1], [pivot_x+0.5, pivot_y-1], [pivot_x, pivot_y]], 
                               closed=True, facecolor='#34495e', edgecolor='#2c3e50', lw=2, zorder=2)
    ax.add_patch(triangle)
    
    # 2. The Beam (Tilted heavily to the right)
    # Angle of tilt: ~15 degrees
    angle = -15 
    beam_length = 8
    beam_width = 0.2
    
    # Rotation matrix helper
    def rotate(x, y, angle_deg):
        theta = np.radians(angle_deg)
        return x * np.cos(theta) - y * np.sin(theta), x * np.sin(theta) + y * np.cos(theta)

    # Drawing the tilted beam
    beam = patches.Rectangle((pivot_x - beam_length/2, pivot_y - beam_width/2), beam_length, beam_width, 
                             angle=angle, rotation_point=(pivot_x, pivot_y),
                             facecolor='#7f8c8d', edgecolor='#34495e', lw=1, zorder=3)
    ax.add_patch(beam)

    # 3. The Weights
    # Calculate positions of beam ends
    end_left_x, end_left_y = rotate(-beam_length/2, 0, angle)
    end_left_x += pivot_x
    end_left_y += pivot_y

    end_right_x, end_right_y = rotate(beam_length/2, 0, angle)
    end_right_x += pivot_x
    end_right_y += pivot_y

    # LEFT WEIGHT (Light - False Positive)
    w_left = patches.Rectangle((end_left_x - 0.4, end_left_y + 0.1), 0.8, 0.6, 
                               angle=angle, rotation_point=(end_left_x, end_left_y),
                               facecolor='#f1c40f', edgecolor='#f39c12', lw=2, zorder=4)
    ax.add_patch(w_left)
    ax.text(end_left_x - 0.5, end_left_y + 1.2, "Hậu quả Báo giả\n(False Positive)", 
            ha='center', va='bottom', fontweight='bold', color='#f39c12', fontsize=12)
    ax.text(end_left_x - 0.5, end_left_y + 0.8, "Trọng số Nhẹ", ha='center', fontsize=10, color='#7f8c8d')

    # RIGHT WEIGHT (Heavy - False Negative)
    w_right = patches.Rectangle((end_right_x - 0.7, end_right_y - 1.2), 1.4, 1.2, 
                                angle=angle, rotation_point=(end_right_x, end_right_y),
                                facecolor='#e74c3c', edgecolor='#c0392b', lw=2, zorder=4)
    ax.add_patch(w_right)
    ax.text(end_right_x + 0.5, end_right_y - 2.2, "Hậu quả Bỏ sót kẹt xe\n(False Negative)", 
            ha='center', va='top', fontweight='bold', color='#c0392b', fontsize=13)
    ax.text(end_right_x + 0.5, end_right_y - 1.6, "TRỌNG SỐ CỰC NẶNG", ha='center', fontweight='bold', fontsize=10, color='#c0392b')

    # 4. Central Philosophy
    plt.text(pivot_x, 6.5, "TỐI ƯU HÓA HƯỚNG AN TOÀN\n(Safety-Oriented Optimization)", 
             ha='center', fontsize=18, fontweight='bold', color='#2c3e50',
             bbox=dict(boxstyle="round,pad=0.5", fc="#e8f5e9", ec="#27ae60", lw=2))

    plt.text(pivot_x, 5.2, "Triết lý thiết kế: 'Thà báo nhầm còn hơn bỏ sót'\nđể bảo vệ tối đa dòng lưu thông", 
             ha='center', fontsize=12, style='italic', color='#34495e')

    # Decorations (Arrows showing the force)
    ax.annotate("", xy=(end_right_x, end_right_y - 1.5), xytext=(end_right_x, end_right_y),
                arrowprops=dict(arrowstyle="->,head_width=0.5,head_length=0.8", color='#c0392b', lw=3))
    
    plt.tight_layout()
    
    # Save
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'asymmetric_penalty_concept.png')
    plt.savefig(output_path, dpi=300)
    print(f"Concept diagram saved to {output_path}")

if __name__ == "__main__":
    draw_asymmetric_balance_concept()
