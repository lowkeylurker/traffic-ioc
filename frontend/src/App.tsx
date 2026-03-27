import { RoleGuard } from '@/components'
import { MainLayout } from '@/layouts/MainLayout'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { CitizenReportsAdminPage } from '@/pages/CitizenReportsAdminPage'
import { NewsPage } from '@/pages/NewsPage'
import { RealTimePage } from '@/pages/RealTimePage'
import { SimulationPage } from '@/pages/SimulationPage'
import { UserProfilePage } from '@/pages/UserProfilePage'
import { Button, Result } from 'antd'
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom'

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
            path="news"
            element={
              <RoleGuard requiredRole="user">
                <NewsPage />
              </RoleGuard>
            }
          />
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
            path="incident-reports"
            element={
              <RoleGuard requiredRole="admin">
                <CitizenReportsAdminPage />
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
