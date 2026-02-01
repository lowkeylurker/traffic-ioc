import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { RealTimePage } from '@/pages/RealTimePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SimulationPage } from '@/pages/SimulationPage'
import { UserProfilePage } from '@/pages/UserProfilePage'
import { RoleGuard } from '@/components'
import { Result, Button } from 'antd'

const UnauthorizedPage = () => (
  <div style={{ padding: '60px 20px', textAlign: 'center' }}>
    <Result
      status="403"
      title="403"
      subTitle="Bạn không có quyền truy cập trang này"
      extra={
        <Button type="primary" href="/">
          Quay lại trang chủ
        </Button>
      }
    />
  </div>
)

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/real-time" replace />} />
          <Route path="real-time" element={<RealTimePage />} />
          <Route
            path="analytics"
            element={
              <RoleGuard requiredRole="admin">
                <AnalyticsPage />
              </RoleGuard>
            }
          />
          <Route
            path="simulation"
            element={
              <RoleGuard requiredRole="admin">
                <SimulationPage />
              </RoleGuard>
            }
          />
          <Route
            path="profile"
            element={
              <RoleGuard requiredRole="user">
                <UserProfilePage />
              </RoleGuard>
            }
          />
        </Route>
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
      </Routes>
    </Router>
  )
}

export default App
