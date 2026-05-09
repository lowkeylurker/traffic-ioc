import matplotlib.pyplot as plt
import networkx as nx
import os

def generate_gnn_vision():
    # 1. Khởi tạo Đồ thị có hướng
    G = nx.DiGraph()
    
    # Định nghĩa các cạnh (mô phỏng lưới đường bộ)
    edges = [
        ('N1', 'N2'), ('N2', 'N3'),
        ('N4', 'N2'), ('N4', 'N5'), ('N4', 'N7'),
        ('N5', 'N6'), ('N7', 'N8'),
        ('N2', 'N5'), ('N1', 'N4')
    ]
    G.add_edges_from(edges)

    # 2. Định nghĩa vị trí (Grid-like layout)
    pos = {
        'N1': (0, 2), 'N2': (1, 2), 'N3': (2, 2),
        'N4': (0, 1), 'N5': (1, 1), 'N6': (2, 1),
        'N7': (0, 0), 'N8': (1, 0)
    }

    # 3. Phân loại màu sắc và kích thước Node
    # N4: Kẹt nặng (Red), N2, N5, N7: Ảnh hưởng (Orange), còn lại: Xanh (Clear)
    node_colors = []
    node_sizes = []
    for node in G.nodes():
        if node == 'N4':
            node_colors.append('#E74C3C') # Red
            node_sizes.append(2500)
        elif node in ['N2', 'N5', 'N7']:
            node_colors.append('#F39C12') # Orange
            node_sizes.append(1800)
        else:
            node_colors.append('#2ECC71') # Green
            node_sizes.append(1500)

    # 4. Vẽ biểu đồ
    plt.figure(figsize=(10, 7), dpi=300)
    
    # Vẽ các cạnh cơ bản (màu xám nhạt)
    nx.draw_networkx_edges(G, pos, edge_color='#BDC3C7', width=1.5, 
                           arrowsize=20, connectionstyle='arc3,rad=0.1')
    
    # Vẽ các Node
    nx.draw_networkx_nodes(G, pos, node_color=node_colors, node_size=node_sizes, 
                           edgecolors='black', linewidths=1.5, alpha=0.9)
    
    # Vẽ nhãn Node
    nx.draw_networkx_labels(G, pos, font_size=12, font_weight='bold', font_color='white')

    # 5. Điểm nhấn GNN: Message Passing (Vẽ lại các mũi tên từ N4)
    gnn_edges = [('N4', 'N2'), ('N4', 'N5'), ('N4', 'N7')]
    nx.draw_networkx_edges(G, pos, edgelist=gnn_edges, edge_color='#C0392B', 
                           width=3, style='dashed', arrowsize=25)

    # 6. Thêm chú thích (Annotations)
    # Chú thích Message Passing
    plt.annotate("GNN Message Passing:\nLan truyền đặc trưng ùn tắc\ntừ N4 sang N2 và N5", 
                 xy=(0.5, 1.5), xytext=(1.2, 1.7),
                 arrowprops=dict(arrowstyle="->", color="#C0392B", lw=1.5),
                 fontsize=10, fontweight='bold', color='#C0392B',
                 bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#C0392B", alpha=0.8))

    # Text box tổng quát
    future_text = (
        "Định hướng tương lai:\n"
        "Mạng lưới giao thông được mô hình hóa\n"
        "thành Đồ thị động G=(V,E) để tính toán\n"
        "hiệu ứng lan truyền (Ripple/Spillback)."
    )
    plt.text(1.3, 0.2, future_text, fontsize=11, style='italic',
             bbox={'facecolor': '#ECF0F1', 'alpha': 0.9, 'edgecolor': '#34495E', 'boxstyle': 'round,pad=0.8'},
             ha='left', fontweight='bold', color='#2C3E50')

    # 7. Trang trí
    plt.title("Tầm nhìn tích hợp Mạng Nơ-ron Đồ thị (GNN)\nđể bắt hiệu ứng gợn sóng không gian", 
              fontsize=16, fontweight='bold', pad=30, color='#2C3E50')
    
    plt.axis('off')
    
    # 8. Lưu file
    pic_dir = "/workspace/ai-core/pictures"
    os.makedirs(pic_dir, exist_ok=True)
    save_path = os.path.join(pic_dir, 'gnn_future_vision.png')
    
    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()
    print(f"✅ Đã tạo biểu đồ tầm nhìn GNN: {save_path}")

if __name__ == "__main__":
    generate_gnn_vision()
