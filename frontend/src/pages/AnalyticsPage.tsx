import { CorridorAnalyticsTab } from '@/pages/analytics/CorridorAnalyticsTab'
import { CorridorReliabilityTab } from '@/pages/analytics/CorridorReliabilityTab'
import { SegmentRoadAnalyticsTab } from '@/pages/analytics/SegmentRoadAnalyticsTab'
import { Tabs, Typography } from 'antd'

const { Title, Text } = Typography

export const AnalyticsPage: React.FC = () => {
  return (
    <div
      style={{
        maxWidth: '100%',
        overflowX: 'hidden',
        padding: '4px 2px 10px',
      }}
    >
      <div style={{ margin: 18 }}>
        <Title level={4} style={{ marginBottom: 4 }}>
          Trung tâm phân tích giao thông
        </Title>
        <Text type="secondary">
          Theo dõi bất thường theo giờ, so sánh baseline và đánh giá hiệu năng
          hành lang theo ngày.
        </Text>
      </div>

      <Tabs
        defaultActiveKey="segment-road"
        tabBarStyle={{ marginBottom: 16, marginLeft: 18 }}
        size="large"
        items={[
          {
            key: 'segment-road',
            label: 'Phân tích Road/Segment',
            children: <SegmentRoadAnalyticsTab />,
          },
          {
            key: 'corridor',
            label: 'Phân tích Hành lang',
            children: <CorridorAnalyticsTab />,
          },
          {
            key: 'corridor-reliability',
            label: 'Độ tin cậy Corridor',
            children: <CorridorReliabilityTab />,
          },
        ]}
      />
    </div>
  )
}
