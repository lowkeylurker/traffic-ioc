// Analytics Page — Trung tâm Phân tích Giao thông Hành lang

import { CorridorAnalyticsTab } from '@/pages/analytics/CorridorAnalyticsTab'
import { CorridorReliabilityTab } from '@/pages/analytics/CorridorReliabilityTab'
import { ApartmentOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Tabs, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import React from 'react'

const { Title, Text } = Typography

export const AnalyticsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'corridor'

  const handleTabChange = (key: string) => {
    // Clear existing params and only set the new tab
    setSearchParams({ tab: key })
  }

  return (
    <>
      <div
        style={{
          maxWidth: '100%',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
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
          activeKey={activeTab}
          onChange={handleTabChange}
          destroyInactiveTabPane
          tabBarStyle={{ marginBottom: 0, marginLeft: 16, marginTop: 8 }}
          size="middle"
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
                <div style={{ padding: '16px' }}>
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
                <div style={{ padding: '16px', height: '100%' }}>
                  <CorridorReliabilityTab />
                </div>
              ),
            },
          ]}
        />
      </div>
      <style>
        {`
        .ant-tabs, .ant-tabs-top, .ant-tabs-middle {
          height: calc(100vh - 120px) !important;
          flex: 1 !important;
        }
        .ant-tabs-content-holder {
          height: 100% !important;
        }

        .ant-tabs-content {
          height: 100% !important;
        }

        .ant-layout-content {
          height: 100vh !important;
        }
          .ant-tabs-tabpane, .ant-tabs-tabpane-active {
            height: 100% !important;
          }
      `}
      </style>
    </>
  )
}
