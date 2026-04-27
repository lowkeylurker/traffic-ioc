/* eslint-disable react-hooks/set-state-in-effect */
// Main Layout Component

import { SignInSignUpDialog } from '@/components'
import { LiveNewsTicker } from '@/components/LiveNewsTicker'
import { LAYOUT_SIDER_WIDTH } from '@/config/constants'
import { setAccessTokenGetter } from '@/services/api'
import {
  BarChartOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Button, Drawer, Grid, Layout, Menu } from 'antd'
import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Sider, Content } = Layout
const { useBreakpoint } = Grid

export const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isSignedIn, signOut, getToken } = useAuth()
  const { user } = useUser()
  const screens = useBreakpoint()
  const [collapsed, setCollapsed] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  // Guest mode is when user is not signed in
  const isGuest = !isSignedIn
  const isAdmin = isSignedIn && user?.publicMetadata?.role === 'admin'
  const isUserMode = !isAdmin
  const isMobileUserView = isUserMode && !screens.lg

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

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const visibleMenuItems = [
    {
      key: '/real-time',
      icon: <EyeOutlined />,
      label: 'Giám sát Vận hành',
    },

    ...(isSignedIn && !isAdmin
      ? [
          // {
          //   key: '/news',
          //   icon: <NotificationOutlined />,
          //   label: 'Tin tức giao thông',
          // },
          {
            key: '/smart-departure',
            icon: <ClockCircleOutlined />,
            label: 'Giờ khởi hành thông minh',
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
            key: '/history',
            icon: <FileSearchOutlined />,
            label: 'Tra cứu Lịch sử',
          },
          // {
          //   key: '/incident-reports',
          //   icon: <AuditOutlined />,
          //   label: 'Duyệt báo cáo công dân',
          // },
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

  const renderMenuFooter = (isCollapsed: boolean, isDrawer = false) => (
    <div
      style={{
        marginTop: 'auto',
        padding: isCollapsed ? '16px 8px' : '16px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isCollapsed && !isDrawer ? 'center' : 'stretch',
        gap: '8px',
        transition: 'all 0.2s',
      }}
    >
      {isGuest ? (
        <Button
          type="primary"
          block={!isCollapsed || isDrawer}
          onClick={() => {
            setAuthDialogOpen(true)
            if (isDrawer) {
              setMobileMenuOpen(false)
            }
          }}
          icon={isCollapsed && !isDrawer ? <UserOutlined /> : undefined}
          style={{
            padding: isCollapsed && !isDrawer ? 0 : undefined,
            width: isCollapsed && !isDrawer ? 36 : undefined,
            minWidth: isCollapsed && !isDrawer ? 36 : undefined,
          }}
        >
          {(!isCollapsed || isDrawer) && 'Đăng nhập / Đăng ký'}
        </Button>
      ) : (
        <>
          {(!isCollapsed || isDrawer) && (
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
            type={isCollapsed && !isDrawer ? 'primary' : 'text'}
            icon={<LogoutOutlined />}
            onClick={async () => {
              if (isDrawer) {
                setMobileMenuOpen(false)
              }
              await handleLogout()
            }}
            size="small"
            block={!isCollapsed || isDrawer}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                isCollapsed && !isDrawer ? 'center' : 'flex-start',
              width: isCollapsed && !isDrawer ? 36 : undefined,
              minWidth: isCollapsed && !isDrawer ? 36 : undefined,
            }}
          >
            {(!isCollapsed || isDrawer) && 'Đăng xuất'}
          </Button>
        </>
      )}
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobileUserView && (
        <Sider
          width={LAYOUT_SIDER_WIDTH}
          collapsedWidth={56}
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
          {renderMenuFooter(collapsed)}
        </Sider>
      )}

      {isMobileUserView && (
        <>
          <Button
            type="primary"
            shape="circle"
            icon={<MenuOutlined />}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Mở menu"
            style={{
              position: 'fixed',
              top: 12,
              right: 12,
              zIndex: 1200,
              boxShadow: '0 8px 18px rgba(0, 21, 41, 0.24)',
            }}
          />

          <Drawer
            placement="right"
            width={280}
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            title="Traffic IOC"
            styles={{
              body: {
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              },
            }}
          >
            <Menu
              theme="light"
              mode="inline"
              selectedKeys={[location.pathname]}
              items={visibleMenuItems}
              onClick={(item) => {
                setMobileMenuOpen(false)
                navigate(item.key)
              }}
              style={{ flex: 1, borderInlineEnd: 'none' }}
            />
            {renderMenuFooter(false, true)}
          </Drawer>
        </>
      )}

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
