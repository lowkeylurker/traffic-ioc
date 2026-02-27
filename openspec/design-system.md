# Design System: Traffic IOC (Professional Light Theme)

Tài liệu này quy định chuẩn thiết kế giao diện cho hệ thống Traffic IOC.
**Phong cách chủ đạo:** Light Mode, Clean, Administrative, High Readability.

## 1. Design Tokens

### 1.1. Color Palette (Bảng màu)

**Backgrounds (Nền)**
Sử dụng tông màu trắng và xám nhạt đặc trưng của các hệ thống Dashboard quản trị (Admin Dashboard).
- `Bg-Base` (Nền App/Layout): `#f0f2f5` (Xám rất nhạt - Chuẩn Ant Design).
- `Bg-Container` (Nền Widget/Card): `#ffffff` (Trắng tinh).
- `Border-Color`: `#d9d9d9` (Xám trung tính).

**Primary Colors (Màu chủ đạo)**
- `Primary`: `#1677ff` (Ant Design Blue - Màu xanh tin cậy, chuyên nghiệp).
- `Primary-Hover`: `#4096ff`.

**Semantic Colors (Màu Giao thông - Tối ưu cho nền sáng)**
Màu sắc cần đậm hơn một chút để nổi bật trên nền bản đồ sáng.
- `Traffic-Fast` (Thông thoáng): `#52c41a` (Leaf Green).
- `Traffic-Moderate` (Đông xe): `#faad14` (Golden Yellow).
- `Traffic-Slow` (Ùn tắc): `#ff4d4f` (Tart Orange).
- `Traffic-Jam` (Tê liệt): `#cf1322` (Dark Red - Màu huyết dụ để báo động).
- `Incident` (Sự cố): `#722ed1` (Purple - Để khác biệt với màu đỏ tắc đường).

**Text Colors**
- `Text-Primary`: `#000000` (Đen - Độ trong suốt 88%).
- `Text-Secondary`: `#000000` (Đen - Độ trong suốt 45%).
- `Text-Disabled`: `#000000` (Đen - Độ trong suốt 25%).

### 1.2. Typography

Ưu tiên sự rõ ràng, dễ đọc.
- **Font Family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
- **Numbers:** `'Roboto Mono'` hoặc `'Inter'` (tabular-nums) để các con số thẳng hàng.

**Scale:**
- `H1` (Tiêu đề trang): 24px, Bold, Color `#001529` (Xanh than đậm).
- `Card Title`: 16px, SemiBold.
- `Body`: 14px, Regular.

### 1.3. Spacing & Shadows

- **Grid:** 8px base unit.
- **Radius:** `6px` (Bo góc nhẹ nhàng, hiện đại).
- **Shadows (Quan trọng trong Light Mode):**
  - Để các Widget màu trắng nổi bật trên nền xám, sử dụng bóng đổ mềm.
  - `Card-Shadow`: `0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)`.

---

## 2. Component Implementation (Ant Design Config)

Cấu hình cho `ConfigProvider` của Ant Design.

### 2.1. Ant Design Theme Config (JSON)

```javascript
{
  algorithm: theme.defaultAlgorithm, // Sử dụng Light Mode mặc định
  token: {
    // Branding
    colorPrimary: '#1677ff',
    
    // Backgrounds
    colorBgLayout: '#f0f2f5', // Nền tổng thể
    colorBgContainer: '#ffffff', // Nền các khối
    
    // Text
    colorTextHeading: '#001529', // Tiêu đề màu tối đậm
    
    // Shape
    borderRadius: 6,
  },
  components: {
    Layout: {
      headerBg: '#ffffff', // Header trắng sạch sẽ
      siderBg: '#001529',  // Sidebar màu tối để tạo điểm nhấn (hoặc để trắng tùy sở thích)
    },
    Card: {
      headerFontSize: 16,
      headerFontWeight: 600,
    },
    Table: {
      headerBg: '#fafafa', // Header bảng màu xám rất nhạt
      rowHoverBg: '#e6f4ff', // Hover dòng màu xanh nhạt
    }
  }
}
```

## 3. Visualization Guidelines
### 3.1. Mapbox Style (Light)
- Sử dụng bản đồ đường phố sáng sủa, chi tiết.

- Style URL: mapbox://styles/mapbox/streets-v12 hoặc mapbox://styles/mapbox/light-v11.

- Lưu ý: Khi dùng bản đồ nền sáng, các đường biểu diễn giao thông (Traffic Lines) cần có độ tương phản cao. Tránh dùng màu vàng nhạt (#ffff00) vì sẽ bị chìm trên nền trắng, hãy dùng màu vàng cam (#faad14).

### 3.2. Charts
- Palette: Sử dụng bảng màu Ant Design Charts mặc định (Xanh dương, Xanh lá, Cam...).

- Background: Nền biểu đồ là Trắng.

- Grid Lines: Màu xám nhạt #f0f0f0.

## 4. UI Patterns
### 4.1. Layout Structure
Global Header: Màu trắng, có bóng đổ nhẹ (box-shadow: 0 2px 8px #f0f1f2). Chứa Logo, Tên hệ thống và User Profile.

Content Area: Có padding 24px. Các Widget được đặt trong Card trắng có bo góc.

### 4.2. Dashboard Widget (Card)
Mỗi widget (Biểu đồ, Bảng số liệu) phải tuân thủ cấu trúc:

Bọc trong component <Card bordered={false}>.

Có Tiêu đề rõ ràng.

Có khoảng cách (gutter) 16px hoặc 24px giữa các card.

### 4.3. Alerts & Badges
Sử dụng Tag hoặc Badge của Ant Design.

Ví dụ:
```
<Tag color="success">Thông thoáng</Tag>

<Tag color="error">Ùn tắc</Tag>
```
