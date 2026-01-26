// Theme Configuration for Ant Design

import { theme } from 'antd'

export const customTheme = {
  token: {
    colorPrimary: '#1890ff', // Xanh giao thông
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#f5222d',
    colorInfo: '#1890ff',
    colorTextBase: '#000000',
    borderRadius: 6,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  },
  algorithm: theme.defaultAlgorithm, // Light theme (có thể chuyển sang darkAlgorithm)
}
