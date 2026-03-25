import {
  AnomalyDistributionChart,
  ComparisonChart,
  ComparisonChartType,
  ComparisonDeltaBarChart,
  ComparisonDeltaPercentBarChart,
  CumulativeMetricChart,
  DataQualityDoughnutChart,
  MiniSparklineChart,
  MultiTimeframeComparisonChart,
  RollingAverageChart,
} from '@/components/charts/ChartComponents'
import { EmptyState, ErrorState, Loading } from '@/components/common'
import {
  useAnalyticsComparison,
  useRoads,
  useSegments,
} from '@/hooks/useTraffic'
import { analyticsApi } from '@/services/api'
import {
  ComparisonDataPoint,
  ComparisonMetric,
  ComparisonScopeType,
} from '@/types'
import { LinkOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  List,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'

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

type DeltaViewMode = 'absolute' | 'percent'
type RollingMode = 'both' | '3h' | '6h'

const getHourLabel = (hour: number) => `${hour.toString().padStart(2, '0')}:00`

const anomalySeverity = (point: {
  isAnomaly: boolean
  todayValue: number | null
  lowerBound: number | null
  upperBound: number | null
}) => {
  if (
    !point.isAnomaly ||
    point.todayValue === null ||
    point.lowerBound === null ||
    point.upperBound === null
  ) {
    return 0
  }

  if (point.todayValue > point.upperBound) {
    return point.todayValue - point.upperBound
  }

  if (point.todayValue < point.lowerBound) {
    return point.lowerBound - point.todayValue
  }

  return 0
}

const longestStreak = (flags: boolean[]) => {
  let maxStreak = 0
  let current = 0

  flags.forEach((flag) => {
    if (flag) {
      current += 1
      if (current > maxStreak) {
        maxStreak = current
      }
      return
    }

    current = 0
  })

  return maxStreak
}

const averageToday = (
  points: Array<{
    todayValue: number | null
  }>
) => {
  const values = points
    .map((point) => point.todayValue)
    .filter((value): value is number => value !== null)

  if (values.length === 0) {
    return null
  }

  const sum = values.reduce((acc, value) => acc + value, 0)
  return sum / values.length
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
  const [comparisonChartType, setComparisonChartType] =
    useState<ComparisonChartType>('lineBand')
  const [deltaMode, setDeltaMode] = useState<DeltaViewMode>('percent')
  const [rollingMode, setRollingMode] = useState<RollingMode>('both')
  const [yesterdayData, setYesterdayData] = useState<ComparisonDataPoint[]>([])
  const [lastWeekData, setLastWeekData] = useState<ComparisonDataPoint[]>([])
  const [trend7, setTrend7] = useState<
    Array<{ label: string; value: number | null }>
  >([])
  const [relativeLoading, setRelativeLoading] = useState(false)

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

  const { data: delayData } = useAnalyticsComparison({
    scopeType,
    segmentId: scopeType === 'segment' ? effectiveSegment : undefined,
    roadKey: scopeType === 'road' ? effectiveRoad : undefined,
    metric: 'delaySeconds',
    date: selectedDate.format('YYYY-MM-DD'),
  })

  useEffect(() => {
    const canQuery =
      (scopeType === 'segment' && Boolean(effectiveSegment)) ||
      (scopeType === 'road' && Boolean(effectiveRoad))

    if (!canQuery) {
      setYesterdayData([])
      setLastWeekData([])
      setTrend7([])
      return
    }

    let active = true

    const fetchRelativeData = async () => {
      setRelativeLoading(true)
      try {
        const baseParams = {
          scopeType,
          segmentId: scopeType === 'segment' ? effectiveSegment : undefined,
          roadKey: scopeType === 'road' ? effectiveRoad : undefined,
          metric: selectedMetric,
        }

        const yesterday = selectedDate.subtract(1, 'day').format('YYYY-MM-DD')
        const lastWeek = selectedDate.subtract(7, 'day').format('YYYY-MM-DD')

        const trendDays = Array.from({ length: 7 }, (_, idx) =>
          selectedDate.subtract(6 - idx, 'day')
        )

        const trendRequests = trendDays.map((dateItem) =>
          analyticsApi.getComparison({
            ...baseParams,
            date: dateItem.format('YYYY-MM-DD'),
          })
        )

        const [yesterdayRes, lastWeekRes, ...trendResponses] =
          await Promise.all([
            analyticsApi.getComparison({ ...baseParams, date: yesterday }),
            analyticsApi.getComparison({ ...baseParams, date: lastWeek }),
            ...trendRequests,
          ])

        if (!active) {
          return
        }

        setYesterdayData(
          yesterdayRes.success && yesterdayRes.data ? yesterdayRes.data : []
        )
        setLastWeekData(
          lastWeekRes.success && lastWeekRes.data ? lastWeekRes.data : []
        )

        const trendValues = trendResponses.map((res, idx) => {
          const label = trendDays[idx].format('DD/MM')
          const source = res.success && res.data ? res.data : []
          return {
            label,
            value: averageToday(source),
          }
        })

        setTrend7(trendValues)
      } catch (fetchError) {
        console.error('Relative comparison fetch failed', fetchError)
        if (active) {
          setYesterdayData([])
          setLastWeekData([])
          setTrend7([])
        }
      } finally {
        if (active) {
          setRelativeLoading(false)
        }
      }
    }

    fetchRelativeData()

    return () => {
      active = false
    }
  }, [effectiveRoad, effectiveSegment, scopeType, selectedDate, selectedMetric])

  const anomalyCount = useMemo(
    () => comparisonData.filter((item) => item.isAnomaly).length,
    [comparisonData]
  )

  const hasAnyValue = comparisonData.some((item) => item.todayValue !== null)

  const totalHours = comparisonData.length
  const anomalyRate = totalHours > 0 ? (anomalyCount / totalHours) * 100 : 0

  const completenessCount = comparisonData.filter(
    (item) => item.todayValue !== null && item.baselineAvg !== null
  ).length
  const dataCompleteness =
    totalHours > 0 ? (completenessCount / totalHours) * 100 : 0

  const maxDeviationPoint = useMemo(() => {
    const candidates = comparisonData
      .map((point) => {
        if (point.todayValue === null || point.baselineAvg === null) {
          return null
        }

        return {
          hour: point.hour,
          value: Math.abs(point.todayValue - point.baselineAvg),
        }
      })
      .filter((item): item is { hour: number; value: number } => item !== null)

    if (candidates.length === 0) {
      return null
    }

    return candidates.reduce((max, current) =>
      current.value > max.value ? current : max
    )
  }, [comparisonData])

  const anomalyDetails = useMemo(() => {
    const detailed = comparisonData
      .filter((point) => point.isAnomaly)
      .map((point) => {
        const severity = anomalySeverity(point)
        let kind: 'upper' | 'lower' | 'unknown' = 'unknown'

        if (
          point.todayValue !== null &&
          point.upperBound !== null &&
          point.todayValue > point.upperBound
        ) {
          kind = 'upper'
        }

        if (
          point.todayValue !== null &&
          point.lowerBound !== null &&
          point.todayValue < point.lowerBound
        ) {
          kind = 'lower'
        }

        return {
          hour: point.hour,
          label: getHourLabel(point.hour),
          severity,
          kind,
        }
      })

    const sorted = [...detailed].sort((a, b) => b.severity - a.severity)

    return {
      upperCount: detailed.filter((item) => item.kind === 'upper').length,
      lowerCount: detailed.filter((item) => item.kind === 'lower').length,
      totalCount: detailed.length,
      peak: sorted[0],
      top3: sorted.slice(0, 3),
      longest: longestStreak(comparisonData.map((item) => item.isAnomaly)),
    }
  }, [comparisonData])

  const rollingWindows = useMemo(() => {
    if (rollingMode === '3h') {
      return [3] as Array<3 | 6>
    }

    if (rollingMode === '6h') {
      return [6] as Array<3 | 6>
    }

    return [3, 6] as Array<3 | 6>
  }, [rollingMode])

  const mapDeepLink = useMemo(() => {
    const params = new URLSearchParams({
      from: 'analytics',
      scopeType,
      metric: selectedMetric,
      date: selectedDate.format('YYYY-MM-DD'),
    })

    if (scopeType === 'segment' && effectiveSegment) {
      params.set('segmentId', effectiveSegment)
    }

    if (scopeType === 'road' && effectiveRoad) {
      params.set('roadKey', effectiveRoad)
    }

    return `/real-time?${params.toString()}`
  }, [effectiveRoad, effectiveSegment, scopeType, selectedDate, selectedMetric])

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
        extra={
          <Space>
            <Button type="link" href={mapDeepLink} icon={<LinkOutlined />}>
              Mở bản đồ theo bộ lọc
            </Button>
            <Text type="secondary">Polling: mỗi 5 phút</Text>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small">
              <Statistic
                title="Anomaly rate"
                value={anomalyRate}
                precision={1}
                suffix="%"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small">
              <Statistic
                title="Peak anomaly hour"
                value={anomalyDetails.peak ? anomalyDetails.peak.label : 'N/A'}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small">
              <Statistic
                title="Max deviation"
                value={maxDeviationPoint ? maxDeviationPoint.value : 0}
                precision={2}
                suffix={comparisonData[0]?.unit ?? ''}
              />
              {maxDeviationPoint && (
                <Text type="secondary">
                  Tại {getHourLabel(maxDeviationPoint.hour)}
                </Text>
              )}
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small">
              <Statistic
                title="Data completeness"
                value={dataCompleteness}
                precision={1}
                suffix="%"
              />
            </Card>
          </Col>
        </Row>

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
          <Card
            title="Phân tích chênh lệch theo giờ"
            extra={
              <Select
                style={{ minWidth: 160 }}
                value={deltaMode}
                options={[
                  { label: 'Delta %', value: 'percent' },
                  { label: 'Delta tuyệt đối', value: 'absolute' },
                ]}
                onChange={(value: DeltaViewMode) => setDeltaMode(value)}
              />
            }
          >
            <div style={{ height: 320 }}>
              {!loading && !error && hasAnyValue ? (
                deltaMode === 'percent' ? (
                  <ComparisonDeltaPercentBarChart data={comparisonData} />
                ) : (
                  <ComparisonDeltaBarChart
                    data={comparisonData}
                    metricLabel={metricLabelMap[selectedMetric]}
                  />
                )
              ) : (
                <EmptyState message="Chưa có dữ liệu để vẽ Delta" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Thống kê bất thường chi tiết">
            <div style={{ height: 320 }}>
              {!loading && !error ? (
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  <Tag color="red">
                    Vượt ngưỡng trên: {anomalyDetails.upperCount}
                  </Tag>
                  <Tag color="orange">
                    Vượt ngưỡng dưới: {anomalyDetails.lowerCount}
                  </Tag>
                  <Tag color="blue">
                    Tổng số giờ bất thường: {anomalyDetails.totalCount}
                  </Tag>
                  <Tag color="purple">
                    Thời lượng bất thường dài nhất: {anomalyDetails.longest} giờ
                  </Tag>
                  <Text strong>Top 3 khung giờ ưu tiên</Text>
                  <List
                    size="small"
                    dataSource={anomalyDetails.top3}
                    locale={{ emptyText: 'Không có điểm bất thường' }}
                    renderItem={(item, idx) => (
                      <List.Item>
                        <Text>
                          {idx + 1}. {item.label} | mức lệch{' '}
                          {item.severity.toFixed(2)}
                        </Text>
                      </List.Item>
                    )}
                  />
                </Space>
              ) : (
                <EmptyState message="Chưa có dữ liệu thống kê bất thường" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Chất lượng dữ liệu theo bộ lọc">
            <div style={{ height: 280 }}>
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

        <Col xs={24} lg={14}>
          <Card
            title="Rolling average để giảm nhiễu"
            extra={
              <Select
                style={{ minWidth: 180 }}
                value={rollingMode}
                options={[
                  { label: '3h + 6h', value: 'both' },
                  { label: 'Chi 3h', value: '3h' },
                  { label: 'Chi 6h', value: '6h' },
                ]}
                onChange={(value: RollingMode) => setRollingMode(value)}
              />
            }
          >
            <div style={{ height: 300 }}>
              {!loading && !error && comparisonData.length > 0 ? (
                <RollingAverageChart
                  data={comparisonData}
                  metricLabel={metricLabelMap[selectedMetric]}
                  windows={rollingWindows}
                />
              ) : (
                <EmptyState message="Chưa có dữ liệu rolling average" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Trend 7 ngày gần nhất (TB theo ngày)">
            <div style={{ height: 300 }}>
              {!relativeLoading && trend7.length > 0 ? (
                <MiniSparklineChart points={trend7} />
              ) : (
                <EmptyState message="Đang tải trend 7 ngày" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="So sánh đa mốc thời gian (cùng khung giờ)">
            <div style={{ height: 340 }}>
              {!relativeLoading && comparisonData.length > 0 ? (
                <MultiTimeframeComparisonChart
                  todayData={comparisonData}
                  yesterdayData={yesterdayData}
                  lastWeekData={lastWeekData}
                  metricLabel={metricLabelMap[selectedMetric]}
                />
              ) : (
                <EmptyState message="Đang tải dữ liệu hôm qua và tuần trước" />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Cumulative delay trong ngày">
            <div style={{ height: 300 }}>
              {delayData.length > 0 ? (
                <CumulativeMetricChart
                  data={delayData}
                  metricLabel="Delay seconds"
                />
              ) : (
                <EmptyState message="Chưa có dữ liệu delay để tính lũy kế" />
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
