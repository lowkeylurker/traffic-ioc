// Main Layout Component

import React, { useState } from 'react'
import { Layout, Menu, Button } from 'antd'
import {
  EyeOutlined,
  BarChartOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { SignInSignUpDialog } from '@/components'
import { LAYOUT_SIDER_WIDTH } from '@/config/constants'

const { Sider, Header, Content } = Layout

export const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn, signOut } = useAuth()
  const { user } = useUser()
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  // Guest mode is when user is not signed in
  const isGuest = !isSignedIn
  const isAdmin = isSignedIn && user?.publicMetadata?.role === 'admin'
  const isRegularUser = isSignedIn && !isAdmin

  const visibleMenuItems = [
    {
      key: '/real-time',
      icon: <EyeOutlined />,
      label: 'Giám sát Vận hành',
    },
    // Profile for regular users
    ...(isRegularUser
      ? [
          {
            key: '/profile',
            icon: <UserOutlined />,
            label: 'Hồ sơ cá nhân',
          },
        ]
      : []),
    // Analytics and Simulation only for admin
    ...(isAdmin
      ? [
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
      : []),
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/real-time')
  }

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
          items={visibleMenuItems}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {isGuest ? (
              <Button type="primary" onClick={() => setAuthDialogOpen(true)}>
                Đăng nhập / Đăng ký
              </Button>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'rgba(0, 0, 0, 0.65)' }}>
                  {user?.firstName} {user?.lastName}
                </span>
                <Button
                  type="text"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                >
                  Đăng xuất
                </Button>
              </>
            )}
          </div>
        </Header>

        <Content style={{ padding: 0, background: '#f0f2f5' }}>
          <Outlet />
        </Content>
      </Layout>

      <SignInSignUpDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
      />
    </Layout>
  )
}
