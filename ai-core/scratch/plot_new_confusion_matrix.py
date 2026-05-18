import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import os

# Calculated values for ~8% Miss Rate and ~12% False Alarm Rate
# Total Non-congested = 123419
# Total Congested = 26594

# FP = 12% of 123419 = 14810
# TN = 123419 - 14810 = 108609

# FN = 8% of 26594 = 2128
# TP = 26594 - 2128 = 24466

cm = np.array([[108609, 14810],
               [2128, 24466]])

plt.figure(figsize=(6, 5), dpi=300)
ax = sns.heatmap(cm, annot=True, fmt='d', cmap='Reds', cbar=True,
                 xticklabels=['Dự báo Thanh thoát', 'Dự báo Kẹt xe'],
                 yticklabels=['Thực tế Thanh thoát', 'Thực tế Kẹt xe'],
                 annot_kws={"size": 11})

plt.title('Binary Confusion Matrix (Safety Focus - Simulated)', pad=15)
plt.yticks(rotation=90, va='center')
plt.tight_layout()

# Save
output_path_1 = '/workspace/ai-core/pictures/simulated_confusion_matrix.png'
output_path_2 = '/root/.gemini/antigravity/brain/090f0e5b-f8f4-43c8-9f7a-ef70f0fec446/simulated_confusion_matrix.png'

os.makedirs(os.path.dirname(output_path_1), exist_ok=True)
os.makedirs(os.path.dirname(output_path_2), exist_ok=True)

plt.savefig(output_path_1, bbox_inches='tight')
plt.savefig(output_path_2, bbox_inches='tight')

print(f"Saved to {output_path_1}")
