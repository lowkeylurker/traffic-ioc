import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { RealTimePage } from '@/pages/RealTimePage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { SimulationPage } from '@/pages/SimulationPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/real-time" replace />} />
          <Route path="real-time" element={<RealTimePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="simulation" element={<SimulationPage />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
