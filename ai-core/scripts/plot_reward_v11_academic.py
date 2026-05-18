import matplotlib.pyplot as plt
import numpy as np
import os

def calculate_reward_v11(action, target, weight=1.0):
    is_true_congested = (target >= 3)
    is_pred_congested = (action >= 3)
    diff = abs(action - target)
    
    bonus = 0
    adj_penalty = 0
    binary_penalty = 0
    
    if diff == 0:
        # 1. Accuracy Bonus (V12.0: Aggressive Congestion Priority)
        bonus = (80.0 if target >= 3 else 30.0) * weight
    elif diff == 1:
        # 2. Adjacency Constraint
        adj_penalty = -10.0
    else:
        # 2. Heavy Penalty for distance > 1
        adj_penalty = -50.0 * diff
        
    if is_true_congested != is_pred_congested:
        if is_true_congested and not is_pred_congested:
            # 3. Missed Jam Penalty (Highly Asymmetric)
            binary_penalty = -250.0
        else:
            # 3. False Alarm Penalty
            binary_penalty = -50.0
            
    return bonus + adj_penalty + binary_penalty

def draw_reward_v11_chart():
    # Setup Academic Style (Light Mode)
    plt.rcParams['font.family'] = 'sans-serif'
    plt.rcParams['axes.facecolor'] = 'white'
    plt.rcParams['figure.facecolor'] = 'white'
    plt.rcParams['grid.color'] = '#e0e0e0'
    
    fig, ax = plt.subplots(figsize=(13, 8), dpi=300)
    
    # Case: Actual is Congested Class 4
    target = 4
    actions = [0, 1, 2, 3, 4, 5]
    rewards = [calculate_reward_v11(a, target) for a in actions]
    
    # Categorize colors based on error severity
    colors = []
    for a in actions:
        if a == target: 
            colors.append('#2ecc71') # Correct (Green)
        elif a >= 3: 
            colors.append('#f1c40f') # Still predicted as congested (Yellow)
        else: 
            colors.append('#e74c3c') # Missed jam (Red)

    bars = ax.bar(actions, rewards, color=colors, edgecolor='black', linewidth=1.2, alpha=0.85, zorder=3)
    
    # Add values on top of bars
    for bar in bars:
        height = bar.get_height()
        offset = -20 if height < 0 else 8
        ax.text(bar.get_x() + bar.get_width()/2., height + offset,
                f'{int(height)}', ha='center', va='center', fontweight='bold', fontsize=12)

    # Axis formatting
    ax.set_title(f"Đặc tính Hệ thống Thưởng Phạt V12.0 (Reward System)\nTrường hợp thực tế là Kẹt xe (Lớp {target})", 
                 fontsize=20, fontweight='bold', pad=30, color='#2c3e50')
    ax.set_xlabel("Hành động của AI (Dự báo của mô hình)", fontsize=14, labelpad=15)
    ax.set_ylabel("Giá trị Thưởng (Reward Value)", fontsize=14, labelpad=15)
    
    ax.set_xticks(actions)
    ax.set_xticklabels([f"Báo L{a}" if a != target else f"ĐÚNG L{a}" for a in actions], fontsize=12)
    
    ax.axhline(0, color='black', linewidth=1.5, zorder=4)
    ax.grid(axis='y', linestyle='--', alpha=0.7, zorder=0)
    
    # Annotations
    ax.annotate('PHẠT HỦY DIỆT\nKHI BỎ SÓT KẸT XE', xy=(1, -400), xytext=(0, -300),
                arrowprops=dict(facecolor='#c0392b', shrink=0.05, width=2),
                fontsize=12, fontweight='bold', color='#c0392b', ha='center',
                bbox=dict(boxstyle="round,pad=0.5", fc="#fdecea", ec="#c0392b", alpha=1))

    ax.annotate('THƯỞNG LỚN\nKHI DỰ BÁO ĐÚNG', xy=(4, 80), xytext=(5, 120),
                arrowprops=dict(facecolor='#27ae60', shrink=0.05, width=2),
                fontsize=12, fontweight='bold', color='#27ae60', ha='center',
                bbox=dict(boxstyle="round,pad=0.5", fc="#e8f5e9", ec="#27ae60", alpha=1))

    # Add a legend for the logic
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], color='#2ecc71', lw=4, label='Dự báo Chính xác'),
        Line2D([0], [0], color='#f1c40f', lw=4, label='Dự báo Sai (Vẫn cùng nhóm Kẹt xe)'),
        Line2D([0], [0], color='#e74c3c', lw=4, label='Sai lệch Nhóm (Bỏ sót kẹt xe)')
    ]
    ax.legend(handles=legend_elements, loc='lower right', fontsize=10, frameon=True, shadow=True)

    # Philosophy banner
    plt.text(2.5, -420, "Triết lý 'Better Safe than Sorry': Phạt nặng nhất khi dự báo 'Bình thường' trong khi thực tế là 'Kẹt xe'", 
             ha='center', fontsize=13, style='italic', fontweight='bold', color='#2c3e50',
             bbox=dict(boxstyle="round,pad=0.6", fc="#f8f9fa", ec="#dee2e6", lw=2))

    plt.tight_layout()
    
    # Save path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, '..', 'pictures')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'asymmetric_reward_v11.png')
    plt.savefig(output_path, dpi=300)
    print(f"Diagram saved to {output_path}")

if __name__ == "__main__":
    draw_reward_v11_chart()
