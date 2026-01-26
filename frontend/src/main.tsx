import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App.tsx'
import { customTheme } from '@/config/theme'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={customTheme} locale={viVN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
