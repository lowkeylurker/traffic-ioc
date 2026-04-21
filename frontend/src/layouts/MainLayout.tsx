// Main Layout Component

import { SignInSignUpDialog } from '@/components'
import { LiveNewsTicker } from '@/components/LiveNewsTicker'
import { LAYOUT_SIDER_WIDTH } from '@/config/constants'
import { setAccessTokenGetter } from '@/services/api'
import {
  AuditOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  LogoutOutlined,
  NotificationOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Button, Layout, Menu } from 'antd'
import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Sider, Content } = Layout

export const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn, signOut, getToken } = useAuth()
  const { user } = useUser()
  const [collapsed, setCollapsed] = useState(true)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  // Guest mode is when user is not signed in
  const isGuest = !isSignedIn
  const isAdmin = isSignedIn && user?.publicMetadata?.role === 'admin'

  useEffect(() => {
    setAccessTokenGetter(async () => {
      if (!isSignedIn) {
        return null
      }
      return (await getToken()) ?? null
    })

    return () => {
      setAccessTokenGetter(null)
    }
  }, [getToken, isSignedIn])

  const visibleMenuItems = [
    {
      key: '/real-time',
      icon: <EyeOutlined />,
      label: 'Giám sát Vận hành',
    },
    ...(isSignedIn && !isAdmin
      ? [
          {
            key: '/news',
            icon: <NotificationOutlined />,
            label: 'Tin tức giao thông',
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
          {
            key: '/bi-olap',
            icon: <DatabaseOutlined />,
            label: 'BI & OLAP Dashboard',
          },
          {
            key: '/incident-reports',
            icon: <AuditOutlined />,
            label: 'Duyệt báo cáo công dân',
          },
        ]
      : []),

    // Profile for regular users
    ...(isSignedIn
      ? [
          {
            key: '/profile',
            icon: <UserOutlined />,
            label: 'Hồ sơ cá nhân',
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
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px',
              textAlign: collapsed ? 'center' : 'left',
              color: '#001529',
              fontSize: collapsed ? 20 : 18,
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {collapsed ? '🚦' : 'Traffic IOC'}
          </div>
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={visibleMenuItems}
            onClick={(item) => navigate(item.key)}
            style={{ flex: 1, borderInlineEnd: 'none' }}
          />
        </div>
        <div
          style={{
            marginTop: 'auto',
            padding: collapsed ? '16px 8px' : '16px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            transition: 'all 0.2s',
          }}
        >
          {isGuest ? (
            <Button
              type="primary"
              block={!collapsed}
              onClick={() => setAuthDialogOpen(true)}
              icon={collapsed ? <UserOutlined /> : undefined}
              style={{ padding: collapsed ? 0 : undefined }}
            >
              {!collapsed && 'Đăng nhập / Đăng ký'}
            </Button>
          ) : (
            <>
              {!collapsed && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'rgba(0, 0, 0, 0.65)',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.firstName} {user?.lastName}
                </span>
              )}
              <Button
                type={collapsed ? 'primary' : 'text'}
                icon={<LogoutOutlined />}
                onClick={handleLogout}
                size="small"
                block
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
              >
                {!collapsed && 'Đăng xuất'}
              </Button>
            </>
          )}
        </div>
      </Sider>

      <Layout>
        <Content style={{ padding: 0, background: '#f0f2f5' }}>
          <Outlet />
        </Content>
      </Layout>

      <SignInSignUpDialog
        open={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
      />

      <LiveNewsTicker />
    </Layout>
  )
}
