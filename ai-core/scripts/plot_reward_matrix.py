import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

def get_reward(action, target):
    """Exact logic from traffic_env.py V11.0"""
    is_true_con = (target >= 3)
    is_pred_con = (action >= 3)
    diff = abs(action - target)
    
    reward = 0
    if diff == 0:
        reward = 80 if target >= 3 else 30
    elif diff == 1:
        reward = -10
    else:
        reward = -50 * diff
        
    if is_true_con != is_pred_con:
        if is_true_con and not is_pred_con:
            reward += -250 # Missed Jam
        else:
            reward += -50 # False Alarm
    return reward

def draw_reward_matrix():
    # Generate 6x6 matrix
    data = np.zeros((6, 6))
    for t in range(6):
        for a in range(6):
            data[t, a] = get_reward(a, t)

    # Plotting
    plt.figure(figsize=(12, 10), dpi=300)
    sns.set_theme(style="white", font='sans-serif')
    
    # Custom colormap: Red -> Yellow -> Green
    ax = sns.heatmap(data, annot=True, fmt=".0f", cmap="RdYlGn", center=0,
                     linewidths=1.5, linecolor='white',
                     annot_kws={"size": 12, "weight": "bold"},
                     cbar_kws={'label': 'Giá trị Thưởng / Phạt'})
    
    # Title and Labels
    ax.set_title("Ma trận Phân phối Thưởng/Phạt (Reward Matrix V12.0)\nTrục quan hệ giữa Thực tế và Hành động của Agent", 
                 fontsize=18, fontweight='bold', pad=30, color='#2c3e50')
    
    ax.set_xlabel("Hành động của AI (Lớp dự báo)", fontsize=14, labelpad=15)
    ax.set_ylabel("Giá trị Thực tế (Ground Truth)", fontsize=14, labelpad=15)
    
    # Highlight zones
    # Drawing rectangles for "Missed Jam" zone (Bottom Left)
    import matplotlib.patches as patches
    rect_missed = patches.Rectangle((0, 3), 3, 3, linewidth=3, edgecolor='darkred', facecolor='none', linestyle='--')
    ax.add_patch(rect_missed)
    ax.text(1.5, 5.8, "VÙNG PHẠT NẶNG\n(Bỏ sót kẹt xe)", ha='center', color='darkred', fontweight='bold', fontsize=12)

    # Drawing rectangle for "False Alarm" zone (Top Right)
    rect_false = patches.Rectangle((3, 0), 3, 3, linewidth=3, edgecolor='darkorange', facecolor='none', linestyle='--')
    ax.add_patch(rect_false)
    ax.text(4.5, -0.3, "VÙNG BÁO GIẢ\n(False Positive)", ha='center', color='darkorange', fontweight='bold', fontsize=12)

    plt.tight_layout()
    
    # Save
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'asymmetric_reward_matrix.png')
    plt.savefig(output_path, dpi=300)
    print(f"Matrix saved to {output_path}")

if __name__ == "__main__":
    draw_reward_matrix()
