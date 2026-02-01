// Theme Configuration for Ant Design
// Based on Design System: Professional Light Theme

import { theme } from 'antd'

export const customTheme = {
  algorithm: theme.defaultAlgorithm, // Light Mode
  token: {
    // Branding
    colorPrimary: '#1677ff', // Ant Design Blue
    colorPrimaryHover: '#4096ff',

    // Backgrounds
    colorBgLayout: '#f0f2f5', // Nền tổng thể
    colorBgContainer: '#ffffff', // Nền các khối
    colorBorder: '#d9d9d9',

    // Semantic Colors
    colorSuccess: '#52c41a', // Traffic Fast
    colorWarning: '#faad14', // Traffic Moderate
    colorError: '#ff4d4f', // Traffic Slow
    colorInfo: '#1677ff',

    // Text
    colorTextHeading: '#001529', // Tiêu đề màu tối đậm
    colorTextBase: '#000000',

    // Typography
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 24,

    // Shape
    borderRadius: 6,

    // Shadows
    boxShadow:
      '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
  },
  components: {
    Layout: {
      headerBg: '#ffffff', // Header trắng sạch sẽ
      siderBg: '#001529', // Sidebar màu tối
      bodyBg: '#f0f2f5',
    },
    Card: {
      headerFontSize: 16,
      headerFontWeight: 600,
    },
    Table: {
      headerBg: '#fafafa', // Header bảng màu xám rất nhạt
      rowHoverBg: '#e6f4ff', // Hover dòng màu xanh nhạt
    },
  },
}
