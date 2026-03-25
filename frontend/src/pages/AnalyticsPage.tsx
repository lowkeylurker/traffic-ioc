import {
  AnomalyDistributionChart,
  ComparisonChart,
  ComparisonChartType,
  ComparisonDeltaBarChart,
  DataQualityDoughnutChart,
} from '@/components/charts/ChartComponents'
import { EmptyState, ErrorState, Loading } from '@/components/common'
import {
  useAnalyticsComparison,
  useRoads,
  useSegments,
} from '@/hooks/useTraffic'
import { ComparisonMetric, ComparisonScopeType } from '@/types'
import {
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
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

const chartTypeOptions: Array<{ label: string; value: ComparisonChartType }> = [
  {
    label: 'Line + Safety Band',
    value: 'lineBand',
  },
  {
    label: 'Grouped Bar (Baseline/Today)',
    value: 'groupedBar',
  },
  {
    label: 'Scatter (điểm theo giờ)',
    value: 'scatter',
  },
]

export const AnalyticsPage: React.FC = () => {
  const segments = useSegments()
  const { roads } = useRoads()
  const [scopeType, setScopeType] = useState<ComparisonScopeType>('segment')
  const [selectedSegment, setSelectedSegment] = useState<string | undefined>()
  const [selectedRoad, setSelectedRoad] = useState<string | undefined>()
  const [selectedMetric, setSelectedMetric] =
    useState<ComparisonMetric>('currentSpeedKmh')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [comparisonChartType, setComparisonChartType] =
    useState<ComparisonChartType>('lineBand')

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

  const renderMainContent = () => {
    if (loading) {
      return (
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
      )
    }

    if (error) {
      return <ErrorState message={error} onRetry={refetch} />
    }

    if (!hasAnyValue) {
      return <EmptyState message="Chưa có dữ liệu cho bộ lọc hiện tại" />
    }

    return (
      <ComparisonChart
        data={comparisonData}
        metricLabel={metricLabelMap[selectedMetric]}
        chartType={comparisonChartType}
      />
    )
  }

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
        style={{ marginBottom: 16 }}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Text strong>Biểu đồ so sánh chính:</Text>
          <Select
            style={{ minWidth: 280 }}
            value={comparisonChartType}
            options={chartTypeOptions}
            onChange={(value: ComparisonChartType) =>
              setComparisonChartType(value)
            }
          />
        </Space>

        <div style={{ height: 420 }}>{renderMainContent()}</div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Delta theo giờ (Today - Baseline)">
            <div style={{ height: 320 }}>
              {!loading && !error && hasAnyValue ? (
                <ComparisonDeltaBarChart
                  data={comparisonData}
                  metricLabel={metricLabelMap[selectedMetric]}
                />
              ) : (
                <EmptyState message="Chưa có dữ liệu để vẽ Delta" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Chất lượng dữ liệu theo bộ lọc">
            <div style={{ height: 320 }}>
              {!loading && !error && comparisonData.length > 0 ? (
                <DataQualityDoughnutChart data={comparisonData} />
              ) : (
                <EmptyState message="Chưa có dữ liệu để đánh giá chất lượng" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Phân bổ mức bất thường theo giờ">
            <div style={{ height: 280 }}>
              {!loading && !error && comparisonData.length > 0 ? (
                <AnomalyDistributionChart data={comparisonData} />
              ) : (
                <EmptyState message="Chưa có dữ liệu để phân tích bất thường" />
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
