import { OlapDashboard } from '@/pages/analytics/OlapDashboard'
import { DatabaseOutlined } from '@ant-design/icons'
import { Typography } from 'antd'
import React from 'react'

const { Title, Text } = Typography

export const BiOlapDashboardPage: React.FC = () => {
  return (
    <div
      style={{
        maxWidth: '100%',
        overflowX: 'hidden',
        padding: '16px',
      }}
    >
      <OlapDashboard />
    </div>
  )
}
