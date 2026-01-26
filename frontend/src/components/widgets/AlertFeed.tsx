// Alert Feed Widget

import React from 'react'
import { Card, List, Tag, Empty } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Alert } from '@/types'
import { formatRelativeTime, getSeverityColor } from '@/utils/format'
import { MOCK_ALERTS } from '@/config/constants'

interface AlertFeedProps {
  alerts?: Alert[]
  maxHeight?: number
  style?: React.CSSProperties
}

export const AlertFeed: React.FC<AlertFeedProps> = ({ alerts = MOCK_ALERTS, maxHeight = 400, style }) => {
  return (
    <Card
      title="Cảnh báo"
      style={{
        position: 'absolute',
        right: 16,
        top: 16,
        width: 300,
        zIndex: 10,
        ...style,
      }}
      bodyStyle={{ padding: '12px', maxHeight, overflowY: 'auto' }}
    >
      {alerts.length === 0 ? (
        <Empty description="Không có cảnh báo" />
      ) : (
        <List
          dataSource={alerts}
          renderItem={(alert) => (
            <List.Item style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <List.Item.Meta
                avatar={
                  <ExclamationCircleOutlined
                    style={{
                      fontSize: 16,
                      color: getSeverityColor(alert.severity),
                    }}
                  />
                }
                title={alert.segmentName}
                description={
                  <div>
                    <p style={{ margin: '4px 0', fontSize: 12 }}>{alert.description}</p>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Tag color={getSeverityColor(alert.severity)}>{alert.incidentType}</Tag>
                      <span style={{ fontSize: 11, color: '#999' }}>{formatRelativeTime(alert.timestamp)}</span>
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}
