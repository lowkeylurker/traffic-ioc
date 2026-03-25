import { ComparisonChart } from '@/components/charts/ChartComponents'
import { EmptyState, ErrorState, Loading } from '@/components/common'
import {
  useAnalyticsComparison,
  useRoads,
  useSegments,
} from '@/hooks/useTraffic'
import { ComparisonMetric, ComparisonScopeType } from '@/types'
import { Card, DatePicker, Select, Space, Tag, Typography } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'

const { Title, Text } = Typography

const metricGroups: Array<{
  label: string
  options: Array<{ label: string; value: ComparisonMetric }>
}> = [
  {
    label: 'Tốc độ & Lưu lượng',
    options: [
      { label: 'Tốc độ hiện tại', value: 'currentSpeedKmh' },
      { label: 'Lưu lượng PCU', value: 'pcuVolume' },
      { label: 'Tỷ lệ chiếm dụng', value: 'occupancyRate' },
    ],
  },
  {
    label: 'Chất lượng giao thông',
    options: [
      { label: 'Traffic Index', value: 'trafficIndex' },
      { label: 'LOS Score', value: 'losScore' },
      { label: 'Congestion Level', value: 'congestionLevel' },
    ],
  },
  {
    label: 'Độ tin cậy & Trễ',
    options: [
      { label: 'Độ trễ (giây)', value: 'delaySeconds' },
      { label: 'Buffer Index', value: 'bufferIndex' },
    ],
  },
]

const metricLabelMap: Record<ComparisonMetric, string> = {
  currentSpeedKmh: 'Tốc độ hiện tại',
  pcuVolume: 'Lưu lượng PCU',
  trafficIndex: 'Traffic Index',
  losScore: 'LOS Score',
  congestionLevel: 'Congestion Level',
  delaySeconds: 'Độ trễ',
  occupancyRate: 'Tỷ lệ chiếm dụng',
  bufferIndex: 'Buffer Index',
}

export const AnalyticsPage: React.FC = () => {
  const segments = useSegments()
  const { roads } = useRoads()
  const [scopeType, setScopeType] = useState<ComparisonScopeType>('segment')
  const [selectedSegment, setSelectedSegment] = useState<string | undefined>()
  const [selectedRoad, setSelectedRoad] = useState<string | undefined>()
  const [selectedMetric, setSelectedMetric] =
    useState<ComparisonMetric>('currentSpeedKmh')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())

  const segmentOptions = useMemo(() => {
    const features = segments?.features ?? []
    return features.map((feature) => ({
      value: String(feature.properties.segmentId),
      label: feature.properties.segmentName,
    }))
  }, [segments])

  const roadOptions = useMemo(
    () =>
      roads.map((road) => ({
        value: road.roadKey,
        label: road.roadName,
      })),
    [roads]
  )

  const effectiveSegment = selectedSegment ?? segmentOptions[0]?.value
  const effectiveRoad = selectedRoad ?? roadOptions[0]?.value

  const {
    data: comparisonData,
    loading,
    error,
    refetch,
  } = useAnalyticsComparison({
    scopeType,
    segmentId: scopeType === 'segment' ? effectiveSegment : undefined,
    roadKey: scopeType === 'road' ? effectiveRoad : undefined,
    metric: selectedMetric,
    date: selectedDate.format('YYYY-MM-DD'),
  })

  const anomalyCount = useMemo(
    () => comparisonData.filter((item) => item.isAnomaly).length,
    [comparisonData]
  )

  const hasAnyValue = comparisonData.some((item) => item.todayValue !== null)

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space size={12} wrap>
          <Select
            placeholder="Chế độ thống kê"
            style={{ minWidth: 160 }}
            value={scopeType}
            onChange={(value: ComparisonScopeType) => setScopeType(value)}
            options={[
              { label: 'Theo segment', value: 'segment' },
              { label: 'Theo road', value: 'road' },
            ]}
          />

          <Select
            showSearch
            placeholder={
              scopeType === 'segment' ? 'Chọn đoạn đường' : 'Chọn tuyến đường'
            }
            style={{ minWidth: 260 }}
            value={scopeType === 'segment' ? effectiveSegment : effectiveRoad}
            options={scopeType === 'segment' ? segmentOptions : roadOptions}
            onChange={(value) => {
              if (scopeType === 'segment') {
                setSelectedSegment(value)
              } else {
                setSelectedRoad(value)
              }
            }}
            optionFilterProp="label"
          />

          <Select
            placeholder="Chọn đại lượng"
            style={{ minWidth: 260 }}
            value={selectedMetric}
            onChange={(value) => setSelectedMetric(value)}
            options={metricGroups}
          />

          <DatePicker
            value={selectedDate}
            format="YYYY-MM-DD"
            onChange={(value) => {
              if (value) {
                setSelectedDate(value)
              }
            }}
          />
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <Title level={5} style={{ margin: 0 }}>
              Dashboard phân tích A3
            </Title>
            <Tag color={anomalyCount > 0 ? 'red' : 'green'}>
              {anomalyCount > 0
                ? `${anomalyCount} điểm bất thường`
                : 'Không có bất thường'}
            </Tag>
          </Space>
        }
        extra={<Text type="secondary">Polling: mỗi 5 phút</Text>}
      >
        <div style={{ height: 420 }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Loading />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : !hasAnyValue ? (
            <EmptyState message="Chưa có dữ liệu cho bộ lọc hiện tại" />
          ) : (
            <ComparisonChart
              data={comparisonData}
              metricLabel={metricLabelMap[selectedMetric]}
            />
          )}
        </div>
      </Card>
    </div>
  )
}
