import numpy as np
import matplotlib.pyplot as plt

# 1. Sinh mảng thời gian
t = np.arange(0, 31)

# 2. Vận tốc thực tế
v_actual = np.where(t <= 14, 45, 5)

# 3. Vận tốc ARIMA dự báo
v_arima = np.zeros_like(t, dtype=float)
v_arima[0:15] = 45
# Giảm dần tuyến tính từ 45 xuống 5 từ t=15 đến t=22
# t=15: 45, t=22: 5. Số bước = 22-15 = 7
for i in range(15, 23):
    v_arima[i] = 45 - (i - 15) * (40 / 7)
v_arima[23:31] = 5

# 4. Thiết lập đồ thị
plt.style.use('seaborn-v0_8-whitegrid')
plt.figure(figsize=(10, 5), dpi=300)

# 5. Vẽ các đường
plt.plot(t, v_actual, color='red', linestyle='-', linewidth=2.5, label='Vận tốc Thực tế')
plt.plot(t, v_arima, color='blue', linestyle='--', linewidth=2.5, label='Dự báo ARIMA')

# 6. Tô màu vùng trễ pha
t_fill = np.arange(15, 23)
plt.fill_between(t_fill, v_actual[15:23], v_arima[15:23], 
                 color='orange', alpha=0.3, label='Vùng trễ pha (Fatal False Negative)')

# 7. Thêm chú thích và tiêu đề
plt.title("Minh họa Hiện tượng Trễ pha (Lagging Effect) của mô hình thống kê ARIMA", fontsize=14, fontweight='bold', pad=15)
plt.xlabel("Thời gian (Timestep)", fontsize=12)
plt.ylabel("Vận tốc giao thông (km/h)", fontsize=12)
plt.ylim(0, 55)
plt.legend(frameon=True, loc='upper right')

# 8. Lưu ảnh và hiển thị
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
# Tạo thư mục pictures bên trong ai-core nếu chưa có
pic_dir = os.path.join(script_dir, 'pictures')
os.makedirs(pic_dir, exist_ok=True)

save_path = os.path.join(pic_dir, 'arima_lagging_effect.png')

plt.tight_layout()
plt.savefig(save_path)
print(f"✅ Đã tạo xong ảnh tại: {save_path}")
