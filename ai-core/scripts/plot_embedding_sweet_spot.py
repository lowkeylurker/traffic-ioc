import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

# Set style for professional look
sns.set_theme(style="whitegrid", font="DejaVu Sans")
plt.rcParams['figure.figsize'] = (10, 6)
plt.rcParams['axes.titlesize'] = 16
plt.rcParams['axes.labelsize'] = 12
plt.rcParams['legend.fontsize'] = 11

def plot_embedding_selection():
    # 1. Data generation
    # X-axis: Embedding Dimension from 1 to 32
    x = np.linspace(1, 32, 100)
    
    # Curve 1: Capacity (Logarithmic growth, plateauing)
    # Using a saturation function: y = 100 * (1 - exp(-k * x))
    # We want it to be around 70-80 at x=8
    capacity = 100 * (1 - np.exp(-0.2 * x))
    
    # Curve 2: Risk (Exponential-ish growth)
    # We want it to intersect capacity at x=8
    # Capacity(8) = 100 * (1 - exp(-1.6)) approx 79.8
    y_intersect = 100 * (1 - np.exp(-0.2 * 8))
    
    # Let's use a power/exponential function for Risk: y = a * b^x
    # We want Risk(8) = y_intersect and Risk(1) = small (e.g., 5)
    # This might grow too fast, so we'll use a gentler curve for visualization
    # y = base_risk + scale * exp(rate * x)
    risk = 5 + (y_intersect - 5) * np.exp(0.12 * (x - 8))
    
    # 2. Plotting
    fig, ax = plt.subplots()
    
    # Plot Capacity
    ax.plot(x, capacity, color='#1abc9c', linewidth=3, label='Năng lực biểu diễn đặc trưng (Capacity)')
    # Fill under Capacity (optional for aesthetics)
    ax.fill_between(x, capacity, alpha=0.1, color='#1abc9c')
    
    # Plot Risk
    ax.plot(x, risk, color='#e67e22', linewidth=3, label='Rủi ro Overfitting & Tốn RAM (Risk)')
    # Fill under Risk
    ax.fill_between(x, risk, alpha=0.1, color='#e67e22')
    
    # 3. Intersection and "Sweet Spot"
    sweet_spot_x = 8
    sweet_spot_y = 100 * (1 - np.exp(-0.2 * sweet_spot_x))
    
    # Vertical dashed line
    ax.axvline(x=sweet_spot_x, color='gray', linestyle='--', linewidth=1.5, alpha=0.7)
    
    # Highlight the Sweet Spot
    ax.scatter(sweet_spot_x, sweet_spot_y, color='red', s=120, zorder=5, edgecolor='white', linewidth=2)
    
    # Annotation
    ax.annotate(f'Điểm vàng (Sweet Spot) - {sweet_spot_x} Chiều',
                xy=(sweet_spot_x, sweet_spot_y),
                xytext=(sweet_spot_x + 2, sweet_spot_y - 15),
                fontsize=12,
                fontweight='bold',
                color='#2c3e50',
                bbox=dict(boxstyle="round,pad=0.5", fc="yellow", ec="orange", alpha=0.8),
                arrowprops=dict(arrowstyle="->", connectionstyle="arc3,rad=.2", color='black'))

    # 4. Styling
    ax.set_xlim(1, 32)
    ax.set_ylim(0, 100)
    
    ax.set_title('Lựa chọn Kích thước Không gian Nhúng (Embedding Dimension)', pad=20, fontweight='bold')
    ax.set_xlabel('Kích thước không gian nhúng (Embedding Dimension)', fontweight='semibold')
    ax.set_ylabel('Mức độ (Relative Scale)', fontweight='semibold')
    
    ax.legend(loc='upper left', frameon=True, shadow=True)
    
    # Clean up grid
    ax.grid(True, linestyle=':', alpha=0.6)
    
    # Ensure tight layout
    plt.tight_layout()
    
    # Save the plot
    # Get the directory of the current script (ai-core/scripts)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up one level to ai-core and then into pictures
    output_dir = os.path.join(script_dir, '..', 'pictures')
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, 'embedding_sweet_spot.png')
    plt.savefig(output_path, dpi=300)
    print(f"Plot saved to {output_path}")
    
    plt.show()

if __name__ == "__main__":
    plot_embedding_selection()
