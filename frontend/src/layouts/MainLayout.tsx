// Main Layout Component

import React from 'react'
import { Layout, Menu } from 'antd'
import { EyeOutlined, BarChartOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
import { LAYOUT_SIDER_WIDTH } from '@/config/constants'

const { Sider, Header, Content } = Layout

export const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const menuItems = [
    {
      key: '/real-time',
      icon: <EyeOutlined />,
      label: 'Giám sát Vận hành',
    },
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: 'Phân tích & Thống kê',
    },
    {
      key: '/simulation',
      icon: <ExperimentOutlined />,
      label: 'Mô phỏng & Dự báo',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={LAYOUT_SIDER_WIDTH} theme="dark">
        <div style={{ padding: '16px', color: 'white', fontSize: 18, fontWeight: 'bold' }}>
          Traffic IOC
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={(item) => navigate(item.key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0 }}>Hệ thống Điều hành Giao thông Thông minh</h2>
          <div style={{ fontSize: 12, color: '#666' }}>Người dùng: Admin</div>
        </Header>

        <Content style={{ margin: '24px 16px', background: '#f5f5f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
