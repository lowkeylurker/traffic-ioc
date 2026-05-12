import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def generate_warm_start_diagram_v2():
    # Tăng kích thước canvas để thoáng hơn
    fig, ax = plt.subplots(figsize=(13, 8), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Bảng màu Material
    color_src = "#607d8b"  # Blue Grey
    color_dest = "#2e7d32" # Green
    color_weights = "#d32f2f" # Red
    color_prep = "#1976d2"  # Blue
    color_bg = "#fdfefe"

    # --- 1. KHỐI NGUỒN: Supervised ML Baseline (Bên trái) ---
    source_box = patches.FancyBboxPatch((5, 45), 25, 40, boxstyle="round,pad=0.5", 
                                        ec=color_src, fc="#f8f9fa", ls="--", lw=1.5)
    ax.add_patch(source_box)
    ax.text(17.5, 88, "Supervised ML Baseline", ha="center", fontweight="bold", color=color_src, fontsize=11)

    # File .pt (Trọng số)
    ax.text(17.5, 68, "best_traffic_model.pt\n(Network Weights)", ha="center", va="center", 
            bbox=dict(boxstyle="round4,pad=0.6", fc="#ffebee", ec=color_weights, lw=2),
            fontsize=9, fontweight="bold", color=color_weights)
    
    # File .pkl (Tiền xử lý)
    ax.text(17.5, 52, "preprocessing_artifacts.pkl\n(Normalization)", ha="center", va="center", 
            bbox=dict(boxstyle="round4,pad=0.6", fc="#e3f2fd", ec=color_prep, lw=2),
            fontsize=9, fontweight="bold", color=color_prep)

    # --- 2. KHỐI ĐÍCH: Double DQN Agent Environment (Bên phải) ---
    dest_box = patches.FancyBboxPatch((48, 15), 48, 75, boxstyle="round,pad=1.0", 
                                      ec=color_dest, fc="#f1f8e9", lw=2)
    ax.add_patch(dest_box)
    ax.text(72, 92, "Double DQN Agent Environment", ha="center", fontweight="bold", color=color_dest, fontsize=12)

    # Đầu vào: Raw State
    ax.text(55, 58, "Raw State\n(Môi trường)", ha="center", va="center", 
            bbox=dict(boxstyle="round,pad=0.5", fc="white", ec="#757575", lw=1), fontsize=9)

    # Khối Scaler/Encoder
    ax.text(75, 58, "Scaler / Encoder", ha="center", va="center", 
            bbox=dict(boxstyle="round,pad=0.5", fc="white", ec=color_prep, lw=2), fontsize=9, fontweight="bold")

    # Khối Q-Network
    ax.text(75, 30, "Q-Network\n(Policy & Target Net)", ha="center", va="center", 
            bbox=dict(boxstyle="round,pad=0.8", fc="white", ec=color_weights, lw=2.5), fontsize=10, fontweight="bold")

    # Đầu ra: Action
    ax.annotate("Action Selection\n(6 Congestion Levels)", xy=(96, 30), xytext=(88, 30),
                arrowprops=dict(arrowstyle="<-", lw=2, color="#424242"), ha="left", fontsize=9, fontweight="bold")

    # --- 3. CÁC MŨI TÊN TIÊM TRI THỨC ---
    # Mũi tên từ .pkl sang Scaler
    ax.annotate("", xy=(68, 58), xytext=(32, 52), 
                arrowprops=dict(arrowstyle="->", lw=2, color=color_prep, connectionstyle="arc3,rad=-0.1"))
    
    # Mũi tên TIÊM TRỌNG SỐ
    ax.annotate("KNOWLEDGE INJECTION\n(Weight Loading)", xy=(65, 30), xytext=(32, 68),
                arrowprops=dict(arrowstyle="fancy", lw=1, color=color_weights, alpha=0.5, connectionstyle="arc3,rad=-0.15"),
                ha="center", fontsize=10, fontweight="bold", color="#b71c1c")

    # Luồng dữ liệu chính
    ax.annotate("", xy=(68, 58), xytext=(61, 58), arrowprops=dict(arrowstyle="->", lw=1.5, color="#616161"))
    ax.annotate("", xy=(75, 40), xytext=(75, 50), arrowprops=dict(arrowstyle="->", lw=1.5, color="#616161"))

    # --- 4. TEXT BOX CHÚ THÍCH ĐIỂM NHẤN ---
    impact_text = "💡 LỢI ÍCH CHIẾN LƯỢC:\nAgent bỏ qua giai đoạn thám hiểm ngẫu nhiên,\nngay lập tức sở hữu 'trực giác' vật lý chuẩn xác."
    ax.text(72, 78, impact_text, ha="center", va="center", 
            bbox=dict(boxstyle="round,pad=0.6", fc="#fffde7", ec="#fbc02d", lw=1.5, ls="--"),
            fontsize=10, fontweight="bold", color="#f57f17")

    # Tiêu đề (Bỏ chữ Hình 5.l)
    plt.title("Sơ đồ luồng Tiêm tri thức (Warm-start) từ mô hình Giám sát sang Đặc vụ Học tăng cường", 
              fontsize=16, fontweight="bold", pad=25, color="#263238")

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'warm_start_mechanism.png')
    plt.savefig(save_path, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✅ Đã cập nhật sơ đồ Warm-start (V2 - Aesthetic): {save_path}")

if __name__ == "__main__":
    generate_warm_start_diagram_v2()
