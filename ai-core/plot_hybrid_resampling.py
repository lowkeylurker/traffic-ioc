import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def generate_hybrid_resampling_arch_v2():
    # Tăng kích thước canvas để thoáng hơn
    fig, ax = plt.subplots(figsize=(14, 8), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Bảng màu Material Design
    color_primary = "#2c3e50"  # Dark Blue-Grey
    color_real = "#3498db"     # Blue
    color_gen = "#9b59b6"      # Purple
    color_final = "#27ae60"    # Green
    color_callout = "#f1c40f"  # Yellow

    # Style các khối
    base_box = dict(boxstyle="round4,pad=0.8", lw=2)
    
    # 1. Khối đầu tiên (Bên trái) - Input
    ax.text(12, 55, "Tập dữ liệu Gốc\n(Imbalanced Data)", ha="center", va="center", 
            bbox=dict(fc="#ecf0f1", ec=color_primary, **base_box), 
            fontsize=12, fontweight="bold", color=color_primary)

    # 2. Nhánh trên: Smart Under-sampling
    ax.text(50, 75, "Smart Under-sampling\n(Anchor: Lớp 3)", ha="center", va="center", 
            bbox=dict(fc="#e1f5fe", ec=color_real, **base_box), 
            fontsize=11, fontweight="bold", color="#01579b")
    ax.text(50, 65, "➤ Cắt tỉa còn ~80k-100k cửa sổ/lớp\n➤ Giữ lại 100% mỏ neo Lớp 3", 
            ha="center", fontsize=9, style="italic", color="#0277bd")

    # 3. Nhánh dưới: Sequence-CTGAN
    ax.text(50, 35, "Sequence-CTGAN\n(Generative AI)", ha="center", va="center", 
            bbox=dict(fc="#f3e5f5", ec=color_gen, **base_box), 
            fontsize=11, fontweight="bold", color="#4a148c")
    ax.text(50, 25, "➤ Sinh 13-timestep Windows\n➤ 30k Lớp 4, 22k Lớp 5", 
            ha="center", fontsize=9, style="italic", color="#6a1b9a")

    # 4. Hợp lưu: Balanced Set
    ax.text(88, 55, "Tập dữ liệu Vàng\n(Balanced Set)", ha="center", va="center", 
            bbox=dict(fc="#e8f5e9", ec=color_final, **base_box), 
            fontsize=12, fontweight="bold", color="#1b5e20")

    # 5. Hệ thống Mũi tên (Arrows) với độ cong mềm mại
    arrow_props = dict(arrowstyle="simple,head_width=1,head_length=1", color="#bdc3c7", lw=1, connectionstyle="arc3,rad=0.2")
    
    # Từ Input ra 2 nhánh
    ax.annotate("", xy=(36, 75), xytext=(22, 60), arrowprops=dict(arrowstyle="-|>", lw=2, color="#95a5a6", connectionstyle="angle,angleA=0,angleB=90,rad=15"))
    ax.annotate("", xy=(36, 35), xytext=(22, 50), arrowprops=dict(arrowstyle="-|>", lw=2, color="#95a5a6", connectionstyle="angle,angleA=0,angleB=-90,rad=15"))

    # Từ 2 nhánh vào Output
    ax.annotate("", xy=(76, 55), xytext=(64, 75), arrowprops=dict(arrowstyle="-|>", lw=2, color="#95a5a6", connectionstyle="angle,angleA=0,angleB=-90,rad=15"))
    ax.annotate("", xy=(76, 55), xytext=(64, 35), arrowprops=dict(arrowstyle="-|>", lw=2, color="#95a5a6", connectionstyle="angle,angleA=0,angleB=90,rad=15"))

    # 6. Khung Chú thích Đột phá (Callout) - Đặt ở vị trí không đè lên text
    callout_text = "💡 ĐIỂM ĐỘT PHÁ:\nSinh tạo theo ma trận Cửa sổ (Window-level)\nbảo toàn Temporal Consistency & Logic Vật lý"
    ax.text(50, 8, callout_text, ha="center", va="center", 
            bbox=dict(boxstyle="round,pad=0.6", fc="#fffde7", ec=color_callout, lw=1.5, ls='--'),
            fontsize=10, fontweight="bold", color="#f57f17")
    
    # Mũi tên chỉ từ Callout lên khối CTGAN
    ax.annotate("", xy=(50, 18), xytext=(50, 14), arrowprops=dict(arrowstyle="->", color=color_callout, lw=2))

    # Text nhãn lớp trên mũi tên
    ax.text(30, 82, "Lớp 0, 1, 2", fontsize=10, color=color_primary, fontweight="bold")
    ax.text(30, 20, "Lớp 4, 5", fontsize=10, color=color_primary, fontweight="bold")

    # Tiêu đề chuyên nghiệp
    plt.title("Kiến trúc Chiến lược Cân bằng Lai (Anchor-based & Sequence-CTGAN)", 
              fontsize=16, fontweight="bold", pad=30, color=color_primary)

    # Lưu và kết thúc
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'hybrid_resampling_arch.png')
    plt.savefig(save_path, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✅ Đã cập nhật sơ đồ kiến trúc (V2 - Anti-overlap): {save_path}")

if __name__ == "__main__":
    generate_hybrid_resampling_arch_v2()
