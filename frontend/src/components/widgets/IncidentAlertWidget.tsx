// Incident Alert Widget Component (A2)
import React, { useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, List, Tag, Badge, Empty } from 'antd'
import {
  FireOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import apiService from '@/services/api'
import {
  IncidentCollection,
  IncidentFeature,
  IncidentSeverity,
  IncidentType,
} from '@/types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/vi'

dayjs.extend(relativeTime)
dayjs.locale('vi')

interface IncidentAlertWidgetProps {
  onIncidentClick?: (incident: IncidentFeature) => void
  mapRef?: React.RefObject<any>
}

// Icon mapping
const INCIDENT_ICONS: Record<IncidentType, React.ReactNode> = {
  ACCIDENT: <WarningOutlined style={{ color: '#ff4d4f' }} />,
  FLOOD: <ThunderboltOutlined style={{ color: '#1890ff' }} />,
  CONSTRUCTION: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
  FIRE: <FireOutlined style={{ color: '#ff0000' }} />,
  OTHER: <ExclamationCircleOutlined style={{ color: '#999' }} />,
}

// Severity colors
const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'gold',
  LOW: 'blue',
}

export const IncidentAlertWidget: React.FC<IncidentAlertWidgetProps> = ({
  onIncidentClick,
  mapRef,
}) => {
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch incidents with polling
  const { data: incidentData, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async (): Promise<IncidentCollection> => {
      const response = await apiService.get('/incidents', {
        params: { status: 'OPEN' },
      })
      return response.data
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  const incidents = incidentData?.features || []

  const handleIncidentClick = (incident: IncidentFeature) => {
    const [lng, lat] = incident.geometry.coordinates

    // Fly to incident location on map
    if (mapRef?.current) {
      const map = mapRef.current.getMap()
      map.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 1000,
      })
    }

    onIncidentClick?.(incident)
  }

  return (
    <Card
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            <FireOutlined style={{ marginRight: '8px' }} />
            Cảnh báo Sự cố
          </span>
          <Badge
            count={incidents.length}
            showZero
            style={{ backgroundColor: '#ff4d4f' }}
          />
        </div>
      }
      style={{
        width: '360px',
        maxHeight: '600px',
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
      bodyStyle={{ padding: '0', maxHeight: '520px', overflow: 'auto' }}
    >
      {incidents.length === 0 ? (
        <Empty
          description="Không có sự cố"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '40px 20px' }}
        />
      ) : (
        <List
          ref={listRef}
          dataSource={incidents}
          loading={isLoading}
          renderItem={(incident) => {
            const { id, type, severity, title, timestamp } = incident.properties
            const relativeTimeText = dayjs(timestamp).fromNow()

            return (
              <List.Item
                key={id}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${
                    severity === 'CRITICAL'
                      ? '#ff0000'
                      : severity === 'HIGH'
                        ? '#ff7a45'
                        : severity === 'MEDIUM'
                          ? '#faad14'
                          : '#1890ff'
                  }`,
                  transition: 'background 0.2s',
                }}
                onClick={() => handleIncidentClick(incident)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div
                      style={{
                        fontSize: '24px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {INCIDENT_ICONS[type]}
                    </div>
                  }
                  title={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>
                        {title}
                      </span>
                      {severity === 'CRITICAL' && (
                        <Tag
                          color="red"
                          style={{
                            animation: 'blink 1.5s infinite',
                            fontWeight: 600,
                          }}
                        >
                          KHẨN CẤP
                        </Tag>
                      )}
                    </div>
                  }
                  description={
                    <div style={{ fontSize: '12px' }}>
                      <div style={{ marginBottom: '4px' }}>
                        <Tag
                          color={SEVERITY_COLORS[severity]}
                          style={{ marginRight: '4px' }}
                        >
                          {severity}
                        </Tag>
                        <Tag>{type}</Tag>
                      </div>
                      <span style={{ color: 'rgba(0,0,0,0.45)' }}>
                        {relativeTimeText}
                      </span>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Card>
  )
}
