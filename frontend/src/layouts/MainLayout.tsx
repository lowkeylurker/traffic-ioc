// Main Layout Component

import React from 'react'
import { Layout, Menu } from 'antd'
import {
  EyeOutlined,
  BarChartOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
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
      <Sider
        width={LAYOUT_SIDER_WIDTH}
        theme="light"
        style={{ background: '#ffffff', borderRight: '1px solid #f0f0f0' }}
      >
        <div
          style={{
            padding: '16px',
            color: '#001529',
            fontSize: 18,
            fontWeight: 'bold',
          }}
        >
          Traffic IOC
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={(item) => navigate(item.key)}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#ffffff',
            padding: '0 24px',
            boxShadow: '0 2px 8px #f0f1f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              color: '#001529',
              fontSize: 24,
              fontWeight: 'bold',
            }}
          >
            Hệ thống Điều hành Giao thông Thông minh
          </h2>
          <div style={{ fontSize: 14, color: 'rgba(0, 0, 0, 0.45)' }}>
            Người dùng: Admin
          </div>
        </Header>

        <Content style={{ padding: 0, background: '#f0f2f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
