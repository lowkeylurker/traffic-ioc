import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App'
import { customTheme } from '@/config/theme'
import './styles/index.css'
import { ClerkProvider } from '@clerk/clerk-react'

const clerkFrontendApi = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkFrontendApi}>
      <ConfigProvider theme={customTheme} locale={viVN}>
        <App />
      </ConfigProvider>
    </ClerkProvider>
  </React.StrictMode>
)
