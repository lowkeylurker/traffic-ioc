import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# Data
errors = [0, 1, 2, 3, 4]
percentages = [65.2, 30.8, 4.0, 0.0, 0.0]

plt.figure(figsize=(8, 5))
ax = sns.barplot(x=errors, y=percentages, palette='viridis')

# Add labels
for i, p in enumerate(ax.patches):
    ax.annotate(f'{percentages[i]:.1f}%', 
                (p.get_x() + p.get_width() / 2., p.get_height()), 
                ha='center', va='center', 
                xytext=(0, 5), 
                textcoords='offset points',
                fontweight='bold')

plt.title('Phân bổ độ lệch lớp (Error Magnitude)')
plt.xlabel('Độ lệch (|True - Pred|)')
plt.ylabel('Phần trăm (%)')
plt.ylim(0, max(percentages) * 1.1)
plt.tight_layout()

# Save
output_path_1 = '/workspace/ai-core/pictures/error_magnitude_custom.png'
output_path_2 = '/root/.gemini/antigravity/brain/090f0e5b-f8f4-43c8-9f7a-ef70f0fec446/error_magnitude_custom.png'
plt.savefig(output_path_1, dpi=300)
plt.savefig(output_path_2, dpi=300)
print("Saved to", output_path_1)
