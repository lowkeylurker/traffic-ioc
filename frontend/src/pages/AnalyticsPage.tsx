// Analytics Page — Trung tâm Phân tích Giao thông Hành lang

import { CorridorAnalyticsTab } from '@/pages/analytics/CorridorAnalyticsTab'
import { CorridorReliabilityTab } from '@/pages/analytics/CorridorReliabilityTab'
import {
  ApartmentOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Tabs, Typography } from 'antd'
import React from 'react'

const { Title, Text } = Typography

export const AnalyticsPage: React.FC = () => {
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
          Trung tâm Phân tích Giao thông Hành lang
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Theo dõi hiệu năng vận hành, phát hiện điểm nghẽn và đánh giá độ tin
          cậy các hành lang giao thông trọng yếu trên địa bàn.
        </Text>
      </div>

      <Tabs
        defaultActiveKey="corridor"
        tabBarStyle={{ marginBottom: 0, marginLeft: 16, marginTop: 8 }}
        size="large"
        items={[
          {
            key: 'corridor',
            label: (
              <span>
                <ApartmentOutlined style={{ marginRight: 6 }} />
                Tổng quan Hành lang
              </span>
            ),
            children: (
              <div style={{ padding: '16px 16px 0' }}>
                <CorridorAnalyticsTab />
              </div>
            ),
          },
          {
            key: 'corridor-reliability',
            label: (
              <span>
                <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                Phân tích Độ tin cậy
              </span>
            ),
            children: (
              <div style={{ padding: '16px 16px 0' }}>
                <CorridorReliabilityTab />
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
