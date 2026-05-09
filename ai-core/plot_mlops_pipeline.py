import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_mlops_pipeline():
    fig, ax = plt.subplots(figsize=(12, 7), dpi=300)
    ax.set_xlim(0, 17)
    ax.set_ylim(0, 10)
    ax.axis('off')

    # Màu sắc
    colors = {
        'data': '#A1C4FD',    # Xanh dương cho Data
        'artifact': '#FAD0C4', # Cam nhạt cho Artifacts
        'model': '#D4FC79',    # Xanh lá cho Model
        'text': '#333333'
    }

    def draw_box(x, y, w, h, text, color, subtext=""):
        rect = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.2", 
                                      fc=color, ec='gray', lw=1.5)
        ax.add_patch(rect)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=10, fontweight='bold')
        if subtext:
            ax.text(x + w/2, y - 0.4, subtext, ha='center', va='top', fontsize=8, style='italic', alpha=0.7)

    # 1. Đường chia đôi môi trường
    ax.axhline(5, color='gray', ls='--', lw=1, alpha=0.5)
    ax.text(14.5, 5.2, 'TRAINING ENVIRONMENT', ha='right', fontsize=10, fontweight='bold', color='gray')
    ax.text(14.5, 4.5, 'PRODUCTION / INFERENCE', ha='right', fontsize=10, fontweight='bold', color='gray')

    # 2. KHỐI TRAINING (Nửa trên)
    draw_box(1, 7.5, 2.5, 1.2, "Raw Training\nData", colors['data'])
    
    # fit() arrow
    ax.annotate('fit()', xy=(5.5, 8.1), xytext=(3.5, 8.1), 
                arrowprops=dict(arrowstyle='->', lw=1.5), ha='center', va='bottom', fontsize=9)
    
    draw_box(5.5, 7.5, 3, 1.2, "Preprocessing\nArtifacts", colors['artifact'], "(Scaler & Encoders)")
    
    # transform() arrow
    ax.annotate('transform()', xy=(10, 8.1), xytext=(8.5, 8.1), 
                arrowprops=dict(arrowstyle='->', lw=1.5), ha='center', va='bottom', fontsize=9)
    
    draw_box(10, 7.5, 2.5, 1.2, "Scaled\nTraining Data", colors['data'])
    
    # Training process
    ax.annotate('', xy=(11.25, 6.5), xytext=(11.25, 7.5), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_box(10, 5.3, 2.5, 1.2, "AI Model\nTraining", colors['model'])

    # 3. KHỐI PRODUCTION (Nửa dưới)
    # Xuất Artifacts
    ax.annotate('Export & Load\n(.pkl file)', xy=(7, 3), xytext=(7, 7.5), 
                arrowprops=dict(arrowstyle='-|>', lw=2, color='orange', ls='-'), 
                ha='left', va='center', fontsize=9, fontweight='bold')

    draw_box(1, 1.5, 2.5, 1.2, "Real-time\nAPI Request", colors['data'], "(Raw Stream Data)")
    
    # transform() ONLY
    ax.annotate('transform() ONLY\n(Consistency)', xy=(5.5, 2.1), xytext=(3.5, 2.1), 
                arrowprops=dict(arrowstyle='->', lw=1.5), ha='center', va='bottom', fontsize=8)
    
    draw_box(5.5, 1.5, 3, 1.2, "Artifacts\n(Loaded)", colors['artifact'])
    
    # Arrow to Model
    ax.annotate('', xy=(10, 2.1), xytext=(8.5, 2.1), arrowprops=dict(arrowstyle='->', lw=1.5))
    draw_box(10, 1.5, 2.5, 1.2, "Pre-trained\nModel", colors['model'], "(Weights Loaded)")
    
    # Final Output
    ax.annotate('', xy=(14, 2.1), xytext=(12.5, 2.1), arrowprops=dict(arrowstyle='->', lw=2, color='green'))
    draw_box(13.5, 1.5, 1.5, 1.2, "Traffic\nPrediction", colors['data'])

    # Tiêu đề
    plt.title("Sơ đồ luồng dữ liệu MLOps và vai trò của Bản hợp đồng dữ liệu (Artifacts)", 
              fontsize=14, fontweight='bold', pad=20)
    
    # Chú thích chân trang
    ax.text(1, 0.2, "* Nguyên tắc: Môi trường Production tuyệt đối không fit() lại dữ liệu, chỉ sử dụng tham số đã học từ tập Training để đảm bảo tính đồng nhất.", 
            fontsize=9, style='italic', color='gray')

    # Lưu ảnh
    script_dir = os.path.dirname(os.path.abspath(__file__))
    pic_dir = os.path.join(script_dir, 'pictures')
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'mlops_artifacts_pipeline.png')

    plt.tight_layout()
    plt.savefig(save_path, bbox_inches='tight')
    plt.close()
    print(f"✅ Sơ đồ MLOps Pipeline đã được lưu tại: {save_path}")

if __name__ == "__main__":
    draw_mlops_pipeline()
