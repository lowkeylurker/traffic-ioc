import {
  AnomalyDistributionChart,
  ComparisonChart,
  ComparisonChartType,
  ComparisonDeltaBarChart,
  ComparisonDeltaPercentBarChart,
  CumulativeMetricChart,
  DataQualityDoughnutChart,
  LineChart,
  MiniSparklineChart,
  MultiTimeframeComparisonChart,
  RollingAverageChart,
} from '@/components/charts/ChartComponents'
import { EmptyState, ErrorState, Loading } from '@/components/common'
import {
  useAnalyticsComparison,
  useCorridorDashboard,
  useCorridorOptions,
  useRoads,
  useSegments,
} from '@/hooks/useTraffic'
import { analyticsApi } from '@/services/api'
import {
  ComparisonDataPoint,
  ComparisonMetric,
  ComparisonScopeType,
} from '@/types'
import {
  AlertOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FilterOutlined,
  FundOutlined,
  LineChartOutlined,
  LinkOutlined,
} from '@ant-design/icons'
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
  Tabs,
  Tag,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import CountUp from 'react-countup'

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
    label: 'Đường + Dải an toàn',
    value: 'lineBand',
  },
  {
    label: 'Cột nhóm (Baseline/Hôm nay)',
    value: 'groupedBar',
  },
  {
    label: 'Phân tán theo giờ',
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

const createCountUpFormatter = (decimals = 0) => {
  // eslint-disable-next-line react/display-name
  return (value: string | number | undefined) => {
    const numericValue = Number(value)

    if (!Number.isFinite(numericValue)) {
      return value ?? 'N/A'
    }

    return (
      <CountUp
        end={numericValue}
        duration={0.9}
        separator=","
        decimals={decimals}
      />
    )
  }
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
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<
    string | undefined
  >(undefined)
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

  const { corridors } = useCorridorOptions()
  const {
    data: corridorDashboard,
    loading: corridorLoading,
    error: corridorError,
  } = useCorridorDashboard({
    date: selectedDate.format('YYYY-MM-DD'),
    corridorKey: selectedCorridorKey,
  })

  const corridorOptions = useMemo(
    () =>
      corridors.map((item) => ({
        value: item.corridorKey,
        label: item.corridorName,
      })),
    [corridors]
  )

  const effectiveCorridor = selectedCorridorKey ?? corridorOptions[0]?.value

  useEffect(() => {
    if (!selectedCorridorKey && corridorOptions[0]?.value) {
      setSelectedCorridorKey(corridorOptions[0].value)
    }
  }, [corridorOptions, selectedCorridorKey])

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

  const speedVsTargetData = {
    labels: corridorDashboard.speedVsTarget.map(
      (item) => `${item.hour.toString().padStart(2, '0')}:00`
    ),
    datasets: [
      {
        label: 'Tốc độ hành lang',
        data: corridorDashboard.speedVsTarget.map(
          (item) => item.avgCorridorSpeed
        ),
        borderColor: '#13c2c2',
        backgroundColor: 'rgba(19, 194, 194, 0.2)',
        borderWidth: 2,
        tension: 0.25,
      },
      {
        label: 'Tốc độ mục tiêu',
        data: corridorDashboard.speedVsTarget.map(
          (item) => item.targetAvgSpeed
        ),
        borderColor: '#1677ff',
        backgroundColor: 'rgba(22, 119, 255, 0.16)',
        borderWidth: 2,
        tension: 0.25,
      },
    ],
  }

  const ttiHourlyData = {
    labels: corridorDashboard.ttiHourly.map(
      (item) => `${item.hour.toString().padStart(2, '0')}:00`
    ),
    datasets: [
      {
        label: 'TTI theo giờ',
        data: corridorDashboard.ttiHourly.map((item) => item.travelTimeIndex),
        borderColor: '#fa8c16',
        backgroundColor: 'rgba(250, 140, 22, 0.2)',
        borderWidth: 2,
        tension: 0.25,
      },
    ],
  }

  const rankingData = {
    labels: corridorDashboard.topDelayCorridors.map(
      (item) => item.corridorName
    ),
    datasets: [
      {
        label: 'Tổng trễ (giây)',
        data: corridorDashboard.topDelayCorridors.map(
          (item) => item.totalDelaySeconds
        ),
        backgroundColor: 'rgba(255, 77, 79, 0.65)',
        borderColor: '#ff4d4f',
        borderWidth: 1,
      },
    ],
  }

  const bottleneckData = {
    labels: corridorDashboard.topBottlenecks.map(
      (item) => `Seg ${item.segmentKey}`
    ),
    datasets: [
      {
        label: 'Số lần xuất hiện bottleneck',
        data: corridorDashboard.topBottlenecks.map((item) => item.count),
        backgroundColor: 'rgba(114, 46, 209, 0.65)',
        borderColor: '#722ed1',
        borderWidth: 1,
      },
    ],
  }

  const heatmapHours = Array.from({ length: 24 }, (_, idx) => idx)
  const heatmapRows = useMemo(() => {
    const grouped = new Map<
      string,
      { corridorName: string; values: Map<number, number | null> }
    >()
    corridorDashboard.heatmap.forEach((cell) => {
      const key = cell.corridorKey
      if (!grouped.has(key)) {
        grouped.set(key, {
          corridorName: cell.corridorName,
          values: new Map<number, number | null>(),
        })
      }
      grouped.get(key)?.values.set(cell.hour, cell.travelTimeIndex)
    })

    return Array.from(grouped.entries()).map(([corridorKey, row]) => ({
      corridorKey,
      corridorName: row.corridorName,
      cells: heatmapHours.map((hour) => row.values.get(hour) ?? null),
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridorDashboard.heatmap])

  const getHeatCellStyle = (value: number | null) => {
    if (value === null) {
      return 'rgba(217, 217, 217, 0.2)'
    }
    if (value < 1.2) {
      return 'rgba(82, 196, 26, 0.5)'
    }
    if (value < 1.5) {
      return 'rgba(250, 173, 20, 0.55)'
    }
    return 'rgba(255, 77, 79, 0.6)'
  }

  const integerCountFormatter = useMemo(() => createCountUpFormatter(0), [])
  const oneDecimalCountFormatter = useMemo(() => createCountUpFormatter(1), [])
  const twoDecimalCountFormatter = useMemo(() => createCountUpFormatter(2), [])

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
            children: (
              <div style={{ paddingBottom: 8 }}>
                <Card
                  style={{ marginBottom: 16 }}
                  title={
                    <Space size={8}>
                      <FilterOutlined />
                      <span>Bộ lọc phân tích</span>
                    </Space>
                  }
                  extra={
                    <Text type="secondary">
                      Chọn phạm vi, đại lượng và ngày để cập nhật toàn bộ
                      dashboard.
                    </Text>
                  }
                >
                  <Space size={12} wrap>
                    <Select
                      placeholder="Chế độ thống kê"
                      style={{ minWidth: 160 }}
                      value={scopeType}
                      onChange={(value: ComparisonScopeType) =>
                        setScopeType(value)
                      }
                      options={[
                        { label: 'Theo segment', value: 'segment' },
                        { label: 'Theo road', value: 'road' },
                      ]}
                    />

                    <Select
                      showSearch
                      placeholder={
                        scopeType === 'segment'
                          ? 'Chọn đoạn đường'
                          : 'Chọn tuyến đường'
                      }
                      style={{ minWidth: 260 }}
                      value={
                        scopeType === 'segment'
                          ? effectiveSegment
                          : effectiveRoad
                      }
                      options={
                        scopeType === 'segment' ? segmentOptions : roadOptions
                      }
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
                    <div>
                      <Space>
                        <DashboardOutlined />
                        <Title level={5} style={{ margin: 0 }}>
                          Dashboard phân tích A3
                        </Title>
                        <Tag color={anomalyCount > 0 ? 'red' : 'green'}>
                          {anomalyCount > 0
                            ? `${anomalyCount} điểm bất thường`
                            : 'Không có bất thường'}
                        </Tag>
                      </Space>
                      <Text type="secondary">
                        Tóm tắt nhanh mức độ bất thường, độ đầy đủ dữ liệu và
                        biểu đồ so sánh chính theo bộ lọc hiện tại.
                      </Text>
                    </div>
                  }
                  extra={
                    <Space>
                      <Button
                        type="link"
                        href={mapDeepLink}
                        icon={<LinkOutlined />}
                      >
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
                          title="Tỷ lệ bất thường"
                          value={anomalyRate}
                          precision={1}
                          suffix="%"
                          formatter={oneDecimalCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card size="small">
                        <Statistic
                          title="Giờ bất thường cao điểm"
                          value={
                            anomalyDetails.peak
                              ? anomalyDetails.peak.label
                              : 'N/A'
                          }
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <Card size="small">
                        <Statistic
                          title="Độ lệch lớn nhất"
                          value={
                            maxDeviationPoint ? maxDeviationPoint.value : 0
                          }
                          precision={2}
                          suffix={comparisonData[0]?.unit ?? ''}
                          formatter={twoDecimalCountFormatter}
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
                          title="Độ đầy đủ dữ liệu"
                          value={dataCompleteness}
                          precision={1}
                          suffix="%"
                          formatter={oneDecimalCountFormatter}
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

                <Row gutter={[16, 20]}>
                  <Col xs={24} lg={14}>
                    <Card
                      title={
                        <Space size={8}>
                          <LineChartOutlined />
                          <span>Phân tích chênh lệch theo giờ</span>
                        </Space>
                      }
                      extra={
                        <Select
                          style={{ minWidth: 160 }}
                          value={deltaMode}
                          options={[
                            { label: 'Delta %', value: 'percent' },
                            { label: 'Delta tuyệt đối', value: 'absolute' },
                          ]}
                          onChange={(value: DeltaViewMode) =>
                            setDeltaMode(value)
                          }
                        />
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        So sánh chênh lệch giữa dữ liệu hiện tại và baseline
                        theo từng khung giờ.
                      </Text>
                      <div style={{ height: 320 }}>
                        {!loading && !error && hasAnyValue ? (
                          deltaMode === 'percent' ? (
                            <ComparisonDeltaPercentBarChart
                              data={comparisonData}
                            />
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
                    <Card
                      title={
                        <Space size={8}>
                          <AlertOutlined />
                          <span>Thống kê bất thường chi tiết</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Hiển thị tần suất vượt ngưỡng và các giờ có độ lệch cao
                        nhất để ưu tiên xử lý.
                      </Text>
                      <div style={{ height: 320 }}>
                        {!loading && !error ? (
                          <Space
                            direction="vertical"
                            style={{ width: '100%' }}
                            size={8}
                          >
                            <Tag color="red">
                              Vượt ngưỡng trên: {anomalyDetails.upperCount}
                            </Tag>
                            <Tag color="orange">
                              Vượt ngưỡng dưới: {anomalyDetails.lowerCount}
                            </Tag>
                            <Tag color="blue">
                              Tổng số giờ bất thường:{' '}
                              {anomalyDetails.totalCount}
                            </Tag>
                            <Tag color="purple">
                              Thời lượng bất thường dài nhất:{' '}
                              {anomalyDetails.longest} giờ
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
                    <Card
                      title={
                        <Space size={8}>
                          <DatabaseOutlined />
                          <span>Chất lượng dữ liệu theo bộ lọc</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Đo mức đầy đủ dữ liệu hợp lệ giữa today và baseline để
                        đánh giá độ tin cậy.
                      </Text>
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
                    <Card
                      title={
                        <Space size={8}>
                          <BarChartOutlined />
                          <span>Phân bổ mức bất thường theo giờ</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Quan sát thời điểm trong ngày có xu hướng phát sinh bất
                        thường nhiều hơn.
                      </Text>
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
                      title={
                        <Space size={8}>
                          <FundOutlined />
                          <span>Rolling average để giảm nhiễu</span>
                        </Space>
                      }
                      extra={
                        <Select
                          style={{ minWidth: 180 }}
                          value={rollingMode}
                          options={[
                            { label: '3h + 6h', value: 'both' },
                            { label: 'Chi 3h', value: '3h' },
                            { label: 'Chi 6h', value: '6h' },
                          ]}
                          onChange={(value: RollingMode) =>
                            setRollingMode(value)
                          }
                        />
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Làm mượt dữ liệu bằng cửa sổ 3h/6h để thấy xu hướng ổn
                        định hơn.
                      </Text>
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
                    <Card
                      title={
                        <Space size={8}>
                          <ClockCircleOutlined />
                          <span>Xu hướng 7 ngày gần nhất (TB theo ngày)</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Theo dõi biến động trung bình ngày trong 1 tuần gần
                        nhất.
                      </Text>
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
                    <Card
                      title={
                        <Space size={8}>
                          <LineChartOutlined />
                          <span>So sánh đa mốc thời gian (cùng khung giờ)</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Đặt hôm nay cạnh hôm qua và tuần trước để nhận diện dịch
                        chuyển mô hình giao thông.
                      </Text>
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
                    <Card
                      title={
                        <Space size={8}>
                          <FundOutlined />
                          <span>Độ trễ tích lũy trong ngày</span>
                        </Space>
                      }
                    >
                      <Text
                        type="secondary"
                        style={{ display: 'block', marginBottom: 12 }}
                      >
                        Tích lũy tổng độ trễ để đánh giá áp lực vận hành theo
                        thời gian.
                      </Text>
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
            ),
          },
          {
            key: 'corridor',
            label: 'Phân tích Hành lang',
            children: (
              <Card
                title={
                  <Space size={8}>
                    <ApartmentOutlined />
                    <span>Phân tích Hành lang</span>
                  </Space>
                }
                extra={
                  <Select
                    style={{ minWidth: 320 }}
                    value={effectiveCorridor}
                    options={corridorOptions}
                    onChange={(value) => setSelectedCorridorKey(value)}
                    placeholder="Chọn hành lang"
                    showSearch
                    optionFilterProp="label"
                  />
                }
              >
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 14 }}
                >
                  Theo dõi hiệu năng hành lang, TTI, bottleneck và cảnh báo vận
                  hành theo corridor đã chọn.
                </Text>
                {corridorLoading ? (
                  <Loading />
                ) : corridorError ? (
                  <ErrorState message={corridorError} />
                ) : (
                  <Row gutter={[16, 20]}>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="Tốc độ TB"
                          value={corridorDashboard.kpis.avgCorridorSpeed ?? 0}
                          precision={2}
                          suffix="km/h"
                          formatter={twoDecimalCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="Tốc độ mục tiêu"
                          value={corridorDashboard.kpis.targetAvgSpeed ?? 0}
                          precision={2}
                          suffix="km/h"
                          formatter={twoDecimalCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="Tổng trễ"
                          value={corridorDashboard.kpis.totalDelaySeconds ?? 0}
                          precision={0}
                          suffix="giây"
                          formatter={integerCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="TTI"
                          value={corridorDashboard.kpis.travelTimeIndex ?? 0}
                          precision={2}
                          formatter={twoDecimalCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="Hiệu quả"
                          value={corridorDashboard.kpis.corridorEfficiency ?? 0}
                          precision={2}
                          formatter={twoDecimalCountFormatter}
                        />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} lg={8} xl={4}>
                      <Card size="small">
                        <Statistic
                          title="Số sự cố"
                          value={
                            corridorDashboard.kpis.activeIncidentCount ?? 0
                          }
                          precision={0}
                          formatter={integerCountFormatter}
                        />
                      </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Card title="Tốc độ thực tế vs mục tiêu theo giờ">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          So sánh tốc độ thực tế với tốc độ mục tiêu để phát
                          hiện khung giờ hụt hiệu năng.
                        </Text>
                        <div style={{ height: 300 }}>
                          <LineChart
                            data={speedVsTargetData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { position: 'top' as const } },
                            }}
                          />
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Card title="TTI theo giờ">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          Chỉ số TTI theo giờ cho biết mức kéo dài thời gian di
                          chuyển.
                        </Text>
                        <div style={{ height: 300 }}>
                          <LineChart
                            data={ttiHourlyData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { position: 'top' as const } },
                            }}
                          />
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24}>
                      <Card title="Top hành lang theo tổng trễ">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          Xếp hạng các corridor có tổng delay cao nhất để ưu
                          tiên can thiệp.
                        </Text>
                        <div style={{ height: 300 }}>
                          <Bar
                            data={rankingData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              indexAxis: 'y' as const,
                              plugins: { legend: { display: false } },
                            }}
                          />
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24}>
                      <Card title="Heatmap giờ x hành lang (TTI)">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          Bản đồ nhiệt giúp thấy corridor nào quá tải theo từng
                          giờ trong ngày.
                        </Text>
                        <div style={{ overflowX: 'hidden' }}>
                          <table
                            style={{
                              borderCollapse: 'collapse',
                              width: '100%',
                              tableLayout: 'fixed',
                            }}
                          >
                            <thead>
                              <tr>
                                <th style={{ textAlign: 'left', padding: 8 }}>
                                  Corridor
                                </th>
                                {heatmapHours.map((hour) => (
                                  <th
                                    key={hour}
                                    style={{ textAlign: 'center', padding: 4 }}
                                  >
                                    {hour.toString().padStart(2, '0')}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {heatmapRows.map((row) => (
                                <tr key={row.corridorKey}>
                                  <td
                                    style={{ padding: 8, whiteSpace: 'nowrap' }}
                                  >
                                    {row.corridorName}
                                  </td>
                                  {row.cells.map((cell, idx) => (
                                    <td
                                      key={`${row.corridorKey}-${idx}`}
                                      style={{
                                        width: 28,
                                        height: 24,
                                        background: getHeatCellStyle(cell),
                                        textAlign: 'center',
                                        fontSize: 10,
                                      }}
                                      title={
                                        cell === null
                                          ? 'N/A'
                                          : `TTI: ${cell.toFixed(2)}`
                                      }
                                    >
                                      {cell === null ? '' : cell.toFixed(1)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Card title="Top segment nghẽn cổ chai">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          Các segment thường xuyên nghẽn nhất trong corridor
                          đang theo dõi.
                        </Text>
                        <div style={{ height: 280 }}>
                          <Bar
                            data={bottleneckData}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: { legend: { display: false } },
                            }}
                          />
                        </div>
                      </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Card title="Cảnh báo ngưỡng & so sánh baseline">
                        <Text
                          type="secondary"
                          style={{ display: 'block', marginBottom: 12 }}
                        >
                          Cảnh báo vượt ngưỡng vận hành và mức chênh lệch so với
                          baseline lịch sử.
                        </Text>
                        <Space direction="vertical" size={10}>
                          <Tag
                            color={
                              corridorDashboard.alerts.isBelowTargetSpeed
                                ? 'red'
                                : 'green'
                            }
                          >
                            {corridorDashboard.alerts.isBelowTargetSpeed
                              ? 'Tốc độ dưới mục tiêu'
                              : 'Tốc độ đạt mục tiêu'}
                          </Tag>
                          <Tag
                            color={
                              corridorDashboard.alerts.isHighTti
                                ? 'red'
                                : 'green'
                            }
                          >
                            {corridorDashboard.alerts.isHighTti
                              ? 'TTI cao (cảnh báo)'
                              : 'TTI trong ngưỡng'}
                          </Tag>
                          <Tag
                            color={
                              corridorDashboard.alerts.isHighIncidentCount
                                ? 'orange'
                                : 'green'
                            }
                          >
                            {corridorDashboard.alerts.isHighIncidentCount
                              ? 'Số sự cố cao'
                              : 'Số sự cố ổn định'}
                          </Tag>

                          <Text>
                            Delta tốc độ vs baseline:{' '}
                            <strong>
                              {corridorDashboard.baselineComparison
                                .speedDeltaPct === null
                                ? 'N/A'
                                : `${corridorDashboard.baselineComparison.speedDeltaPct.toFixed(2)}%`}
                            </strong>
                          </Text>
                          <Text>
                            Delta tổng trễ vs baseline:{' '}
                            <strong>
                              {corridorDashboard.baselineComparison
                                .delayDeltaPct === null
                                ? 'N/A'
                                : `${corridorDashboard.baselineComparison.delayDeltaPct.toFixed(2)}%`}
                            </strong>
                          </Text>
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
