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
        padding: '0 0 16px',
      }}
    >
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          marginBottom: 4,
        }}
      >
        <Title level={4} style={{ marginBottom: 4, color: '#0f1b37' }}>
          <DatabaseOutlined style={{ marginRight: 8 }} />
          BI & OLAP Dashboard
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Phân tích đa chiều dữ liệu giao thông từ Data Warehouse với Heatmap,
          Bubble Chart và Drill-down theo thời gian.
        </Text>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <OlapDashboard />
      </div>
    </div>
  )
}
