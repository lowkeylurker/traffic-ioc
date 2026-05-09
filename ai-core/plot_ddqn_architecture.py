import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def generate_ddqn_architecture_v3():
    # Tăng kích thước canvas để thoáng hơn
    fig, ax = plt.subplots(figsize=(14, 8), dpi=300)
    ax.set_xlim(0, 110)
    ax.set_ylim(0, 100)
    ax.axis('off')

    # Bảng màu chuyên nghiệp
    color_policy = "#1976d2" # Indigo
    color_target = "#e53935" # Red
    color_input = "#f5f5f5"  # Grey
    color_action = "#ffffff" # White
    color_result = "#fff9c4" # Light Yellow

    # 1. Khối Đầu vào (Left)
    ax.add_patch(patches.Rectangle((2, 40), 16, 20, fc=color_input, ec="#424242", lw=1.5))
    ax.text(10, 50, "Trạng thái kế tiếp\n($S_{t+1}$)", ha="center", va="center", fontweight="bold", fontsize=10)

    # 2. Phân nhánh mũi tên (Dùng FancyArrowPatch để mượt hơn)
    ax.annotate("", xy=(26, 68), xytext=(18, 52), arrowprops=dict(arrowstyle="->", lw=1.5, connectionstyle="arc3,rad=0.15", color="#616161"))
    ax.annotate("", xy=(26, 32), xytext=(18, 48), arrowprops=dict(arrowstyle="->", lw=1.5, connectionstyle="arc3,rad=-0.15", color="#616161"))

    # 3. Hai mạng song song (Middle)
    # Mạng Chính
    ax.add_patch(patches.Rectangle((26, 58), 24, 20, fc=color_policy, ec="black", lw=2))
    ax.text(38, 68, "Mạng Chính\n(Policy Network - $\\theta$)", ha="center", va="center", color="white", fontweight="bold", fontsize=9)

    # Mạng Đích
    ax.add_patch(patches.Rectangle((26, 22), 24, 20, fc=color_target, ec="black", lw=2, alpha=0.85))
    ax.text(38, 32, "Mạng Đích\n(Target Network - $\\theta^-$)", ha="center", va="center", color="white", fontweight="bold", fontsize=9)

    # 4. Cơ chế Lựa chọn (Selection)
    # Đẩy khối Action ra xa (x=65)
    ax.annotate("", xy=(65, 68), xytext=(50, 68), arrowprops=dict(arrowstyle="->", lw=2, color=color_policy))
    ax.text(57.5, 71, "1. Lựa chọn (Selection)", ha="center", va="bottom", fontsize=9, fontweight="bold", color=color_policy)
    
    ax.add_patch(patches.FancyBboxPatch((65, 63), 18, 10, boxstyle="round,pad=0.2", fc=color_action, ec=color_policy, lw=1.5))
    ax.text(74, 68, "$a^* = \\text{argmax } Q(S_{t+1}, a; \\theta)$", ha="center", va="center", fontsize=8, fontweight="bold")

    # 5. Cơ chế Đánh giá (Evaluation)
    # Khối kết quả cuối cùng (x=90)
    ax.add_patch(patches.Rectangle((90, 40), 18, 20, fc=color_result, ec="black", lw=1.5))
    ax.text(99, 50, "Giá trị Đích:\n$Q(S_{t+1}, a^*; \\theta^-)$", ha="center", va="center", fontsize=9, fontweight="bold")

    # Mũi tên từ Target Network sang (Đánh giá)
    ax.annotate("", xy=(90, 45), xytext=(50, 32), 
                arrowprops=dict(arrowstyle="->", lw=2, color=color_target, connectionstyle="arc3,rad=0.2"))
    ax.text(65, 30, "2. Đánh giá (Evaluation)", ha="center", va="top", fontsize=9, fontweight="bold", color=color_target)
    
    # Mũi tên từ Action a* xuống (Truyền hành động đã chọn)
    ax.annotate("", xy=(92, 58), xytext=(78, 63), arrowprops=dict(arrowstyle="->", lw=1.5, ls="--", color="#424242"))

    # 6. Cập nhật trọng số mềm (Soft Update)
    ax.annotate("", xy=(38, 42), xytext=(38, 58), arrowprops=dict(arrowstyle="<-", lw=1.5, ls="--", color="#f57c00"))
    ax.text(38, 50, "Cập nhật trọng số mềm\n(Soft Update: $\\tau$)", ha="center", va="center", 
            fontsize=8, color="#e65100", fontweight="bold", bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.7))

    # Tiêu đề
    plt.title("Kiến trúc Double DQN - Cơ chế kiểm chứng chéo chống ảo tưởng giá trị (Overestimation Bias)", 
              fontsize=14, fontweight="bold", pad=25)

    # Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'ddqn_architecture.png')
    plt.savefig(save_path, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"✅ Đã cập nhật sơ đồ kiến trúc Double DQN (V3 - Clean): {save_path}")

if __name__ == "__main__":
    generate_ddqn_architecture_v3()
