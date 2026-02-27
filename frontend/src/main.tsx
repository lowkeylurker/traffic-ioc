import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import viVN from 'antd/locale/vi_VN'
import App from './App'
import { customTheme } from '@/config/theme'
import './styles/index.css'
import { ClerkProvider } from '@clerk/clerk-react'

const clerkFrontendApi = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkFrontendApi}>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={customTheme} locale={viVN}>
          <App />
        </ConfigProvider>
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
)
