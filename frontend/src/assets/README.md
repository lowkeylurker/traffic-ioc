# Assets Folder

Thư mục này chứa các tài nguyên tĩnh của ứng dụng:

- **images/**: Hình ảnh, icon custom (nếu có)
- **fonts/**: Font tùy chỉnh (nếu không dùng web fonts)

## Cấu trúc hiện tại:
- Tạm thời để trống, dùng Ant Design icons từ `@ant-design/icons`
- Dùng Lucide icons từ `lucide-react`
- Dùng Mapbox GL built-in icons

## Cách thêm static assets:
```tsx
import logo from '@/assets/images/logo.png'

<img src={logo} alt="Logo" />
```

Vite sẽ tự động optimize hình ảnh khi build.
