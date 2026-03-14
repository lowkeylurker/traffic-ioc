### 4.1. Page 1: Real-time Operations (`src/pages/RealTimePage.tsx`)

- **Layout Strategy:** Z-Index Layering (Bản đồ nằm dưới cùng, các Widget nổi bên trên).
- **Theme:** Light Mode (Clean Enterprise).

**Components:**

1.  **Full-screen Map (`z-index: 0`):**
    - Sử dụng `react-map-gl`.
    - Style: Streets Light.

2.  **Top KPI Bar (`z-index: 10` - Top Center/Left):**
    - Một hàng ngang chứa 4 Card nhỏ, nền trắng, shadow nhẹ.
    - Hiển thị: Avg Speed, Active Jams, Incident Count, Weather Status.
    - *Ví dụ:* [ 🚗 32km/h ▼ ] [ 🚦 5 Tắc nghẽn ] [ ⛈️ Mưa nhẹ ]

3.  **Alert Feed Panel (`z-index: 10` - Top Right - Width 300px):**
    - Danh sách cuộn dọc, nền trắng bán trong suốt (Glassmorphism).
    - Hiển thị tin vắn: "17:30 - Tai nạn tại Cầu Sài Gòn".

4.  **Map Controls (`z-index: 10` - Bottom Right):**
    - **Layer Toggle:** Nút để bật/tắt Heatmap, Camera icon.
    - **Zoom/Compass:** Điều khiển bản đồ cơ bản.
    - **Legend (Chú giải):** Bảng nhỏ giải thích màu (Xanh > 40km, Đỏ < 10km).

5.  **CCTV Modal (Hidden by default):**
    - Popup hiện ra khi click vào icon Camera trên bản đồ.
    - Hiển thị ảnh Mockup/GIF giả lập luồng video.