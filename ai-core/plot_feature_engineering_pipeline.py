import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_feature_eng_pipeline():
    fig, ax = plt.subplots(figsize=(12, 8), dpi=300)
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # Định nghĩa màu sắc
    c_raw = '#E0E0E0'      # Xám cho raw
    c_process = '#FFF9C4'  # Vàng nhạt cho xử lý
    c_feature = '#C8E6C9'  # Xanh lá nhạt cho feature
    c_final = '#BBDEFB'    # Xanh dương nhạt cho final

    def draw_box(x, y, w, h, text, color, fontsize=9):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1", 
                                      fc=color, ec='black', lw=1)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=fontsize, fontweight='bold')

    # 1. KHỐI NGUỒN (INPUT)
    draw_box(0.5, 4.5, 2, 1, "Raw Traffic\nData", c_raw)
    ax.annotate('', xy=(3.5, 5), xytext=(2.5, 5), arrowprops=dict(arrowstyle='->', lw=1.5))

    # 2. CÁC NHÁNH XỬ LÝ (PROCESSING BRANCHES)
    # Nhánh Thời gian
    draw_box(4, 7.5, 2.5, 1, "Temporal\nEncoding", c_process)
    ax.annotate('Timestamp', xy=(4, 8), xytext=(3, 5.5), arrowprops=dict(arrowstyle='->', connectionstyle="arc3,rad=.2"))
    
    # Nhánh Không gian
    draw_box(4, 4.5, 2.5, 1, "Spatial\nEmbedding", c_process)
    ax.annotate('Segment ID', xy=(4, 5), xytext=(2.5, 5), arrowprops=dict(arrowstyle='->'))

    # Nhánh Động lực học
    draw_box(4, 1.5, 2.5, 1, "Lag\nGeneration", c_process)
    ax.annotate('Traffic Index', xy=(4, 2), xytext=(3, 4.5), arrowprops=dict(arrowstyle='->', connectionstyle="arc3,rad=-.2"))

    # 3. ĐẶC TRƯNG ĐẦU RA (ENGINEERED FEATURES)
    draw_box(8, 7.5, 2.5, 1, "Hour Sin/Cos\nPeak Hour Flag", c_feature)
    draw_box(8, 4.5, 2.5, 1, "Entity\nEmbeddings", c_feature)
    draw_box(8, 1.5, 2.5, 1, "Windowed Lags\n(T-1 to T-12)", c_feature)

    # Nối các khối
    ax.annotate('', xy=(8, 8), xytext=(6.5, 8), arrowprops=dict(arrowstyle='->', lw=1.2))
    ax.annotate('', xy=(8, 5), xytext=(6.5, 5), arrowprops=dict(arrowstyle='->', lw=1.2))
    ax.annotate('', xy=(8, 2), xytext=(6.5, 2), arrowprops=dict(arrowstyle='->', lw=1.2))

    # 4. KHỐI HỢP NHẤT (FUSION)
    draw_box(12, 4.5, 2.5, 1, "Feature Fusion\nVector (X)", c_final)
    ax.annotate('', xy=(12, 5), xytext=(10.5, 8), arrowprops=dict(arrowstyle='->', connectionstyle="arc3,rad=-.1"))
    ax.annotate('', xy=(12, 5), xytext=(10.5, 5), arrowprops=dict(arrowstyle='->'))
    ax.annotate('', xy=(12, 5), xytext=(10.5, 2), arrowprops=dict(arrowstyle='->', connectionstyle="arc3,rad=.1"))

    # Tiêu đề và ghi chú
    plt.title("Sơ đồ quy trình Thiết kế Đặc trưng (Feature Engineering Pipeline)", fontsize=14, fontweight='bold', pad=20)
    
    ax.text(7.5, 0.2, "* Quy trình đảm bảo Model Alignment bằng cách tách biệt Contextual và Dynamic features.", 
            ha='center', fontsize=9, style='italic', color='gray')

    # Lưu ảnh
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'feature_engineering_pipeline.png')
    
    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Đã lưu sơ đồ Feature Engineering: {save_path}")

if __name__ == "__main__":
    draw_feature_eng_pipeline()
