import { EmptyState, ErrorState } from '@/components/common'
import { useCorridorDashboard, useCorridorOptions } from '@/hooks/useTraffic'
import {
  AlertOutlined,
  ApartmentOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  FireOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  message,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CountUp from 'react-countup'
import {
  CartesianGrid,
  Cell,
  Legend,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts'

const { Text, Title } = Typography

const createCountUpFormatter = (decimals = 0) => {
  // eslint-disable-next-line react/display-name
  return (value: string | number | undefined) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return value ?? 'N/A'
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

const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '--'
  }

  const roundedSeconds = Math.max(0, Math.round(seconds))
  const days = Math.floor(roundedSeconds / 86400)
  const hours = Math.floor((roundedSeconds % 86400) / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const remainingSeconds = roundedSeconds % 60

  if (days > 0) {
    return `${days} ngày ${hours} giờ`
  }

  if (hours > 0) {
    return `${hours} giờ ${minutes} phút`
  }

  if (minutes > 0) {
    return `${minutes} phút${remainingSeconds > 0 ? ` ${remainingSeconds} giây` : ''}`
  }

  return `${roundedSeconds} giây`
}

const formatSegmentId = (segmentId: string): string => {
  const normalized = String(segmentId)
  if (normalized.length <= 6) {
    return normalized
  }

  return `…${normalized.slice(-6)}`
}

const getGradientOffset = (
  minValue: number,
  maxValue: number,
  threshold: number
) => {
  if (
    !Number.isFinite(minValue) ||
    !Number.isFinite(maxValue) ||
    maxValue === minValue
  ) {
    return 0.5
  }

  const offset = (maxValue - threshold) / (maxValue - minValue)
  return Math.min(1, Math.max(0, offset))
}

// Determine operational status based on KPIs
const getOperationalStatus = (
  isBelowTargetSpeed: boolean,
  isHighTti: boolean,
  isHighIncidentCount: boolean
): {
  level: 'success' | 'warning' | 'error'
  label: string
  description: string
} => {
  const alertCount = [
    isBelowTargetSpeed,
    isHighTti,
    isHighIncidentCount,
  ].filter(Boolean).length
  if (alertCount === 0)
    return {
      level: 'success',
      label: 'Vận hành bình thường',
      description: 'Tất cả chỉ số trong ngưỡng cho phép',
    }
  if (alertCount === 1)
    return {
      level: 'warning',
      label: 'Cần theo dõi',
      description: 'Phát hiện 1 chỉ số cần chú ý',
    }
  return {
    level: 'error',
    label: 'Cần can thiệp',
    description: `Phát hiện ${alertCount} chỉ số vượt ngưỡng`,
  }
}

const getTtiLabel = (tti: number | null): string => {
  if (tti === null) return 'N/A'
  if (tti < 1.1) return 'Lưu thông tốt'
  if (tti < 1.3) return 'Tương đối chậm'
  if (tti < 1.5) return 'Chậm đáng kể'
  return 'Ùn tắc'
}

const getTtiColor = (tti: number | null): string => {
  if (tti === null) return '#d9d9d9'
  if (tti < 1.1) return '#52C41A'
  if (tti < 1.3) return '#FADB14'
  if (tti < 1.5) return '#FA8C16'
  return '#F5222D'
}

const getEfficiencyLabel = (efficiency: number | null): string => {
  if (efficiency === null) return 'N/A'
  const pct = efficiency * 100
  if (pct >= 90) return 'Rất tốt'
  if (pct >= 75) return 'Tốt'
  if (pct >= 60) return 'Trung bình'
  return 'Yếu'
}

interface CorridorAnalyticsTabProps {
  selectedDate?: Dayjs
}

interface RankingBarDatum {
  id: string
  label: string
  totalDelay: number
  fill: string
}

interface SegmentRankingTooltipProps {
  active?: boolean
  payload?: Array<{ payload: RankingBarDatum }>
}

const SegmentRankingTooltip: React.FC<SegmentRankingTooltipProps> = ({
  active,
  payload,
}) => {
  const datum = payload?.[0]?.payload as RankingBarDatum | undefined

  if (!active || !datum) {
    return null
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(datum.id)
    message.success('Đã copy mã Segment!')
  }

  return (
    <Card
      size="small"
      bodyStyle={{ padding: '10px 12px' }}
      style={{
        minWidth: 280,
        borderRadius: 10,
        boxShadow: '0 10px 26px rgba(0,0,0,0.14)',
      }}
    >
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Mã đoạn đường (Segment ID):
          </Text>
          <Space size={6} align="center" style={{ width: '100%' }}>
            <Text
              ellipsis={{ tooltip: datum.id }}
              style={{
                fontFamily: 'Menlo, Monaco, Consolas, monospace',
                fontSize: 12,
                flex: 1,
                minWidth: 0,
              }}
            >
              {datum.id}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                void handleCopy()
              }}
            />
          </Space>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tổng trễ:{' '}
          </Text>
          <Text strong>{formatDuration(datum.totalDelay)}</Text>
        </div>
      </Space>
    </Card>
  )
}

export const CorridorAnalyticsTab: React.FC<CorridorAnalyticsTabProps> = ({
  selectedDate: externalDate,
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCorridor = searchParams.get('corridor') || undefined
  const initialDateStr = searchParams.get('date')
  const initialDate =
    initialDateStr && dayjs(initialDateStr).isValid()
      ? dayjs(initialDateStr)
      : (externalDate ?? dayjs())

  const [selectedCorridorKey, setSelectedCorridorKey] = useState<
    string | undefined
  >(initialCorridor)
  const [selectedDate, setSelectedDate] = useState<Dayjs>(initialDate)

  // Sync state to URL
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (selectedCorridorKey) {
          params.set('corridor', selectedCorridorKey)
        } else {
          params.delete('corridor')
        }
        params.set('date', selectedDate.format('YYYY-MM-DD'))
        return params
      },
      { replace: true }
    )
  }, [selectedCorridorKey, selectedDate, setSearchParams])

  // Sync URL to state (for back/forward browser buttons)
  useEffect(() => {
    const corridor = searchParams.get('corridor')
    if (corridor && corridor !== selectedCorridorKey) {
      setSelectedCorridorKey(corridor)
    }
    const dateStr = searchParams.get('date')
    if (dateStr && dateStr !== selectedDate.format('YYYY-MM-DD')) {
      const d = dayjs(dateStr)
      if (d.isValid()) {
        setSelectedDate(d)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const { corridors, loading: corridorsLoading } = useCorridorOptions()
  const {
    data: dash,
    loading: corridorLoading,
    error: corridorError,
  } = useCorridorDashboard({
    date: selectedDate.format('YYYY-MM-DD'),
    corridorKey: selectedCorridorKey,
  })

  const corridorOptions = useMemo(
    () =>
      corridors.map((c) => ({ value: c.corridorKey, label: c.corridorName })),
    [corridors]
  )
  const effectiveCorridor = selectedCorridorKey ?? corridorOptions[0]?.value

  useEffect(() => {
    if (!selectedCorridorKey && corridorOptions[0]?.value) {
      setSelectedCorridorKey(corridorOptions[0].value)
    }
  }, [corridorOptions, selectedCorridorKey])

  const selectedCorridorName =
    corridorOptions.find((c) => c.value === effectiveCorridor)?.label ??
    'Hành lang'

  const twoDecFmt = useMemo(() => createCountUpFormatter(2), [])
  const oneDecFmt = useMemo(() => createCountUpFormatter(1), [])
  const zeroDecFmt = useMemo(() => createCountUpFormatter(0), [])

  const opStatus = useMemo(
    () =>
      getOperationalStatus(
        dash.alerts.isBelowTargetSpeed,
        dash.alerts.isHighTti,
        dash.alerts.isHighIncidentCount
      ),
    [dash.alerts]
  )

  const isEmptyData = useMemo(() => {
    return (
      dash.speedVsTarget.length === 0 &&
      dash.ttiHourly.length === 0 &&
      dash.kpis.avgCorridorSpeed === null &&
      dash.kpis.travelTimeIndex === null
    )
  }, [dash])

  const speedTrendData = useMemo(
    () =>
      dash.speedVsTarget.map((item) => ({
        label: `${item.hour.toString().padStart(2, '0')}:00`,
        actualSpeed: item.avgCorridorSpeed,
        targetSpeed: item.targetAvgSpeed,
      })),
    [dash.speedVsTarget]
  )

  const ttiTrendData = useMemo(
    () =>
      dash.ttiHourly.map((item) => ({
        label: `${item.hour.toString().padStart(2, '0')}:00`,
        tti: item.travelTimeIndex,
      })),
    [dash.ttiHourly]
  )

  const speedGradientOffset = useMemo(() => {
    const speeds = dash.speedVsTarget
      .map((item) => item.avgCorridorSpeed)
      .filter((value): value is number => value !== null && value !== undefined)
    const minValue = speeds.length > 0 ? Math.min(...speeds) : 0
    const maxValue = speeds.length > 0 ? Math.max(...speeds) : 1
    const targetValue = dash.kpis.targetAvgSpeed ?? 35.8
    return getGradientOffset(minValue, maxValue, targetValue)
  }, [dash.kpis.targetAvgSpeed, dash.speedVsTarget])

  const ttiGradientOffset = useMemo(() => {
    const ttiValues = dash.ttiHourly
      .map((item) => item.travelTimeIndex)
      .filter((value): value is number => value !== null && value !== undefined)
    const minValue = ttiValues.length > 0 ? Math.min(...ttiValues) : 0.8
    const maxValue = ttiValues.length > 0 ? Math.max(...ttiValues) : 1.8
    return getGradientOffset(minValue, maxValue, 1.3)
  }, [dash.ttiHourly])

  const topDelaySegments = useMemo(
    () => dash.topDelaySegments ?? [],
    [dash.topDelaySegments]
  )
  const topDelayCorridors = useMemo(
    () => dash.topDelayCorridors ?? [],
    [dash.topDelayCorridors]
  )

  const rankingMode = topDelaySegments.length > 0 ? 'segment' : 'corridor'

  const rankingBarData = useMemo<RankingBarDatum[]>(() => {
    if (rankingMode === 'segment') {
      return topDelaySegments.map((item, idx) => ({
        id: item.segmentId,
        label: formatSegmentId(item.segmentId),
        totalDelay: item.totalDelay,
        fill:
          idx === 0
            ? '#F5222D'
            : idx === 1
              ? '#FA8C16'
              : 'rgba(255,77,79,0.72)',
      }))
    }

    return topDelayCorridors.map((item, idx) => ({
      id: item.corridorName,
      label: item.corridorName,
      totalDelay: item.totalDelaySeconds,
      fill:
        idx === 0 ? '#F5222D' : idx === 1 ? '#FA8C16' : 'rgba(255,77,79,0.72)',
    }))
  }, [rankingMode, topDelayCorridors, topDelaySegments])

  const bottleneckRechartsData = useMemo(() => {
    return dash.topBottlenecks.map((item) => ({
      label: formatSegmentId(item.segmentKey),
      count: item.count,
    }))
  }, [dash.topBottlenecks])

  const operationalAlert = useMemo(() => {
    const issues: string[] = []

    if (
      dash.alerts.isBelowTargetSpeed &&
      dash.kpis.avgCorridorSpeed !== null &&
      dash.kpis.targetAvgSpeed !== null
    ) {
      issues.push(
        `Tốc độ TB ${dash.kpis.avgCorridorSpeed.toFixed(1)} km/h thấp hơn mục tiêu ${dash.kpis.targetAvgSpeed.toFixed(1)} km/h`
      )
    }

    if (dash.alerts.isHighTti && dash.kpis.travelTimeIndex !== null) {
      issues.push(
        `TTI đạt ${dash.kpis.travelTimeIndex.toFixed(2)} nên hành trình đang bị kéo dài`
      )
    }

    if (
      dash.alerts.isHighIncidentCount &&
      dash.kpis.activeIncidentCount !== null
    ) {
      issues.push(
        `Có ${dash.kpis.activeIncidentCount} sự cố đang ảnh hưởng đến luồng di chuyển`
      )
    }

    if (issues.length === 0) {
      return null
    }

    return {
      title: `Cảnh báo vận hành - ${selectedCorridorName}`,
      description: `${issues.join('; ')}. Chênh lệch so với baseline ${
        dash.baselineComparison.delayDeltaPct !== null
          ? `${dash.baselineComparison.delayDeltaPct >= 0 ? '+' : ''}${dash.baselineComparison.delayDeltaPct.toFixed(1)}%`
          : 'chưa xác định'
      }. Dữ liệu real-time cho thấy các đoạn nghẽn cục bộ đang cộng dồn thành tổng trễ lớn hơn bình thường.`,
    }
  }, [dash, selectedCorridorName])

  // Heatmap data
  const heatmapHours = Array.from({ length: 24 }, (_, i) => i)
  const heatmapRows = useMemo(() => {
    const grouped = new Map<
      string,
      { corridorName: string; values: Map<number, number | null> }
    >()
    dash.heatmap.forEach((cell) => {
      if (!grouped.has(cell.corridorKey)) {
        grouped.set(cell.corridorKey, {
          corridorName: cell.corridorName,
          values: new Map(),
        })
      }
      grouped.get(cell.corridorKey)?.values.set(cell.hour, cell.travelTimeIndex)
    })
    return Array.from(grouped.entries()).map(([key, row]) => ({
      corridorKey: key,
      corridorName: row.corridorName,
      cells: heatmapHours.map((h) => row.values.get(h) ?? null),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash.heatmap])

  const getHeatColor = (value: number | null): string => {
    if (value === null) return 'rgba(200,200,200,0.15)'
    if (value < 1.1) return 'rgba(82,196,26,0.55)'
    if (value < 1.3) return 'rgba(250,219,20,0.6)'
    if (value < 1.5) return 'rgba(250,140,22,0.65)'
    return 'rgba(245,34,45,0.7)'
  }


  if (corridorsLoading && corridors.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Card style={{ marginBottom: 16 }}>
          <Skeleton active paragraph={{ rows: 1 }} />
        </Card>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Col key={i} xs={12} sm={8} md={8} lg={4}>
              <Card size="small">
                <Skeleton active title={false} paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
        <Card>
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* ─── PHẦN A: BỘ LỌC + KPI ─── */}
      <Card
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg,#f8f9fe 0%,#eef2fb 100%)',
          border: '1px solid #e8ecf5',
        }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} md={12} lg={8}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <FilterOutlined style={{ marginRight: 4 }} />
                Chọn hành lang
              </Text>
              <Select
                style={{ width: '100%' }}
                value={effectiveCorridor}
                options={corridorOptions}
                onChange={(value) => setSelectedCorridorKey(value)}
                placeholder="Chọn hành lang"
                showSearch
                optionFilterProp="label"
                size="large"
              />
            </Space>
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <CalendarOutlined style={{ marginRight: 4 }} />
                Chọn ngày phân tích
              </Text>
              <DatePicker
                value={selectedDate}
                format="DD/MM/YYYY"
                onChange={(val) => {
                  if (val) setSelectedDate(val)
                }}
                style={{ width: '100%' }}
                size="large"
                allowClear={false}
              />
            </Space>
          </Col>
          <Col xs={24} lg={10}>
            <div style={{ textAlign: 'right' }}>
              <Tag
                icon={
                  opStatus.level === 'success' ? (
                    <CheckCircleOutlined />
                  ) : opStatus.level === 'warning' ? (
                    <ExclamationCircleOutlined />
                  ) : (
                    <AlertOutlined />
                  )
                }
                color={
                  opStatus.level === 'success'
                    ? 'success'
                    : opStatus.level === 'warning'
                      ? 'warning'
                      : 'error'
                }
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 20 }}
              >
                {opStatus.label}
              </Tag>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {opStatus.description}
                </Text>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {corridorError ? (
        <ErrorState message={corridorError} />
      ) : corridorLoading ? (
        <div style={{ marginTop: 8 }}>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Col key={i} xs={12} sm={8} md={8} lg={4}>
                <Card size="small">
                  <Skeleton active title={false} paragraph={{ rows: 2 }} />
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={14}>
              <Card title="Đang tải dữ liệu tốc độ...">
                <Skeleton active paragraph={{ rows: 8 }} />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Đang tải dữ liệu TTI...">
                <Skeleton active paragraph={{ rows: 8 }} />
              </Card>
            </Col>
          </Row>
        </div>
      ) : isEmptyData ? (
        <Card
          style={{
            marginTop: 8,
            borderRadius: 12,
            textAlign: 'center',
            padding: '40px 0',
            background: '#fff',
            border: '1px solid #f0f0f0',
          }}
        >
          <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <EmptyState
              message={`Không có dữ liệu vận hành cho hành lang ${selectedCorridorName}`}
              description={`Dữ liệu cho ngày ${selectedDate.format('DD/MM/YYYY')} hiện chưa được ghi nhận. Vui lòng thử chọn một ngày khác hoặc hành lang khác.`}
            />
            <Button
              type="primary"
              ghost
              style={{ marginTop: 24, borderRadius: 8 }}
              onClick={() => setSelectedDate(dayjs())}
            >
              Xem dữ liệu hôm nay
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{ textAlign: 'center', height: '100%' }}
                hoverable
              >
                <Statistic
                  title={
                    <Tooltip title="Tốc độ trung bình thực tế của toàn hành lang trong ngày">
                      <span>
                        <DashboardOutlined
                          style={{ color: '#1677ff', marginRight: 4 }}
                        />
                        Tốc độ TB
                      </span>
                    </Tooltip>
                  }
                  value={dash.kpis.avgCorridorSpeed ?? undefined}
                  precision={1}
                  suffix="km/h"
                  formatter={oneDecFmt}
                  valueStyle={{
                    color: dash.alerts.isBelowTargetSpeed
                      ? '#F5222D'
                      : '#52C41A',
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
                {dash.kpis.targetAvgSpeed !== null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Mục tiêu: {dash.kpis.targetAvgSpeed.toFixed(1)} km/h
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{ textAlign: 'center', height: '100%' }}
                hoverable
              >
                <Statistic
                  title={
                    <Tooltip title="Chỉ số TTI > 1.3 = hành trình kéo dài đáng kể; > 1.5 = ùn tắc">
                      <span>
                        <ClockCircleOutlined
                          style={{ color: '#FA8C16', marginRight: 4 }}
                        />
                        Chỉ số TTI
                      </span>
                    </Tooltip>
                  }
                  value={dash.kpis.travelTimeIndex ?? undefined}
                  precision={2}
                  formatter={twoDecFmt}
                  valueStyle={{
                    color: getTtiColor(dash.kpis.travelTimeIndex),
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
                <Text
                  style={{
                    fontSize: 11,
                    color: getTtiColor(dash.kpis.travelTimeIndex),
                  }}
                >
                  {getTtiLabel(dash.kpis.travelTimeIndex)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{ textAlign: 'center', height: '100%' }}
                hoverable
              >
                <Statistic
                  title={
                    <Tooltip title="Tổng thời gian mất mát của các xe trên hành lang trong ngày">
                      <span>
                        <FireOutlined
                          style={{ color: '#F5222D', marginRight: 4 }}
                        />
                        Tổng trễ
                      </span>
                    </Tooltip>
                  }
                  value={dash.kpis.totalDelaySeconds ?? undefined}
                  precision={0}
                  suffix="giây"
                  formatter={zeroDecFmt}
                  valueStyle={{
                    color: '#F5222D',
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ≈ {formatDuration(dash.kpis.totalDelaySeconds)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{ textAlign: 'center', height: '100%' }}
                hoverable
              >
                <Statistic
                  title={
                    <Tooltip title="Hiệu suất vận hành: 1.0 = tối ưu hoàn toàn; < 0.7 = cần xem xét">
                      <span>
                        <ThunderboltOutlined
                          style={{ color: '#722ed1', marginRight: 4 }}
                        />
                        Hiệu suất
                      </span>
                    </Tooltip>
                  }
                  value={
                    dash.kpis.corridorEfficiency !== null
                      ? dash.kpis.corridorEfficiency * 100
                      : undefined
                  }
                  precision={1}
                  suffix="%"
                  formatter={oneDecFmt}
                  valueStyle={{
                    color:
                      (dash.kpis.corridorEfficiency ?? 0) >= 0.75
                        ? '#52C41A'
                        : '#FA8C16',
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
                <Text style={{ fontSize: 11, color: '#666' }}>
                  {getEfficiencyLabel(dash.kpis.corridorEfficiency)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{ textAlign: 'center', height: '100%' }}
                hoverable
              >
                <Statistic
                  title={
                    <Tooltip title="Sự cố đang hoạt động ảnh hưởng đến hành lang này">
                      <span>
                        <AlertOutlined
                          style={{ color: '#fa8c16', marginRight: 4 }}
                        />
                        Sự cố
                      </span>
                    </Tooltip>
                  }
                  value={dash.kpis.activeIncidentCount ?? undefined}
                  precision={0}
                  suffix="sự cố"
                  formatter={zeroDecFmt}
                  valueStyle={{
                    color:
                      (dash.kpis.activeIncidentCount ?? 0) > 0
                        ? '#FA8C16'
                        : '#52C41A',
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card
                size="small"
                style={{
                  textAlign: 'center',
                  height: '100%',
                  background: '#fafafa',
                }}
                hoverable
              >
                <Text
                  strong
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    fontSize: 12,
                    color: 'rgba(0,0,0,0.55)',
                  }}
                >
                  <BarChartOutlined style={{ marginRight: 4 }} />
                  So với baseline{' '}
                  <Tooltip title="Baseline là mốc so sánh từ cùng ngày hoặc cùng khung giờ trước. Khi hành lang có vài điểm nghẽn cục bộ, độ trễ sẽ cộng dồn nhanh trên toàn tuyến nên chênh lệch có thể lớn dù không phải tất cả segment đều xấu.">
                    <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                  </Tooltip>
                </Text>
                <Space direction="vertical" size={4}>
                  {dash.baselineComparison.speedDeltaPct !== null && (
                    <Text style={{ fontSize: 13 }}>
                      Tốc độ{' '}
                      {dash.baselineComparison.speedDeltaPct >= 0 ? (
                        <Text style={{ color: '#52C41A', fontWeight: 600 }}>
                          <ArrowUpOutlined />+
                          {dash.baselineComparison.speedDeltaPct.toFixed(1)}%
                        </Text>
                      ) : (
                        <Text style={{ color: '#F5222D', fontWeight: 600 }}>
                          <ArrowDownOutlined />
                          {dash.baselineComparison.speedDeltaPct.toFixed(1)}%
                        </Text>
                      )}
                    </Text>
                  )}
                  {dash.baselineComparison.delayDeltaPct !== null && (
                    <Text style={{ fontSize: 13 }}>
                      Trễ{' '}
                      {dash.baselineComparison.delayDeltaPct <= 0 ? (
                        <Text style={{ color: '#52C41A', fontWeight: 600 }}>
                          <ArrowDownOutlined />
                          {dash.baselineComparison.delayDeltaPct.toFixed(1)}%
                        </Text>
                      ) : (
                        <Text style={{ color: '#F5222D', fontWeight: 600 }}>
                          <ArrowUpOutlined />+
                          {dash.baselineComparison.delayDeltaPct.toFixed(1)}%
                        </Text>
                      )}
                    </Text>
                  )}
                  {dash.baselineComparison.speedDeltaPct === null &&
                    dash.baselineComparison.delayDeltaPct === null && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Chưa có baseline
                      </Text>
                    )}
                </Space>
              </Card>
            </Col>
          </Row>

          {/* ─── PHẦN B: CẢNH BÁO VẬN HÀNH ─── */}
          {operationalAlert && (
            <Card
              style={{
                marginBottom: 16,
                border: '1px solid #ffccc7',
                background: '#fff2f0',
              }}
              bodyStyle={{ padding: '12px 20px' }}
            >
              <Alert
                type="error"
                showIcon
                message={operationalAlert.title}
                description={operationalAlert.description}
                style={{
                  background: '#fff2f0',
                  border: '1px solid #ffccc7',
                  borderRadius: 10,
                }}
              />
            </Card>
          )}

          {/* ─── PHẦN C: XU HƯỚNG TRONG NGÀY ─── */}
          <Title
            level={5}
            style={{ margin: '0 0 12px', color: '#555', letterSpacing: 0.2 }}
          >
            <DashboardOutlined style={{ marginRight: 6 }} />
            Diễn biến trong ngày — {selectedCorridorName}
          </Title>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={14}>
              <Card
                title={
                  <Space>
                    <DashboardOutlined style={{ color: '#1677ff' }} />
                    <span>Tốc độ thực tế so với mục tiêu vận hành</span>
                  </Space>
                }
                extra={
                  <Badge
                    status={
                      dash.alerts.isBelowTargetSpeed ? 'error' : 'success'
                    }
                    text={
                      dash.alerts.isBelowTargetSpeed
                        ? 'Dưới mục tiêu'
                        : 'Đạt mục tiêu'
                    }
                  />
                }
              >
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                >
                  Vùng màu đỏ chỉ ra các khung giờ tốc độ thực tế thấp hơn mức
                  vận hành kỳ vọng.
                </Text>
                <div style={{ height: 280 }}>
                  {speedTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart
                        data={speedTrendData}
                        margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="speedTrendGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#52C41A"
                              stopOpacity={1}
                            />
                            <stop
                              offset={`${Math.round(speedGradientOffset * 100)}%`}
                              stopColor="#52C41A"
                              stopOpacity={1}
                            />
                            <stop
                              offset={`${Math.round(speedGradientOffset * 100)}%`}
                              stopColor="#F5222D"
                              stopOpacity={1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#F5222D"
                              stopOpacity={1}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.06)"
                        />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          width={42}
                          domain={['auto', 'auto']}
                        />
                        <RechartsTooltip
                          formatter={(value: any) => [
                            Number(value || 0).toFixed(1),
                            'Tốc độ',
                          ]}
                        />
                        <Legend />
                        <ReferenceLine
                          y={dash.kpis.targetAvgSpeed ?? 35.8}
                          stroke="#1677ff"
                          strokeDasharray="5 4"
                        />
                        <RechartsLine
                          type="monotone"
                          dataKey="actualSpeed"
                          name="Tốc độ thực tế (km/h)"
                          stroke="url(#speedTrendGradient)"
                          strokeWidth={3}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <RechartsLine
                          type="monotone"
                          dataKey="targetSpeed"
                          name="Mục tiêu vận hành (km/h)"
                          stroke="#1677ff"
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={false}
                        />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu tốc độ theo giờ" />
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card
                title={
                  <Space>
                    <ClockCircleOutlined style={{ color: '#FA8C16' }} />
                    <span>Chỉ số kéo dài hành trình (TTI) theo giờ</span>
                  </Space>
                }
                extra={
                  <Tooltip title="TTI = 1.0 là điều kiện lý tưởng. TTI = 1.5 nghĩa là hành trình mất gấp 1.5 lần bình thường.">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      TTI là gì?
                    </Text>
                  </Tooltip>
                }
              >
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                >
                  Đường đỏ đứt là ngưỡng cảnh báo (1.3). Điểm đỏ = giờ cần ưu
                  tiên can thiệp.
                </Text>
                <div style={{ height: 280 }}>
                  {ttiTrendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart
                        data={ttiTrendData}
                        margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="ttiTrendGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#F5222D"
                              stopOpacity={1}
                            />
                            <stop
                              offset={`${Math.round(ttiGradientOffset * 100)}%`}
                              stopColor="#F5222D"
                              stopOpacity={1}
                            />
                            <stop
                              offset={`${Math.round(ttiGradientOffset * 100)}%`}
                              stopColor="#FA8C16"
                              stopOpacity={1}
                            />
                            <stop
                              offset="100%"
                              stopColor="#FA8C16"
                              stopOpacity={1}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.06)"
                        />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          width={42}
                          domain={[0.8, 'auto']}
                        />
                        <RechartsTooltip
                          formatter={(value: any) => [
                            Number(value || 0).toFixed(2),
                            'Chỉ số TTI',
                          ]}
                        />
                        <Legend />
                        <ReferenceLine
                          y={1.3}
                          stroke="#ff4d4f"
                          strokeDasharray="4 4"
                        />
                        <RechartsLine
                          type="monotone"
                          dataKey="tti"
                          name="Chỉ số kéo dài hành trình (TTI)"
                          stroke="url(#ttiTrendGradient)"
                          strokeWidth={3}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu TTI" />
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          {/* ─── PHẦN D: HEATMAP CORRIDOR x GIỜ ─── */}
          <Card
            title={
              <Space>
                <ApartmentOutlined style={{ color: '#722ed1' }} />
                <span>
                  Bản đồ nhiệt — Chỉ số TTI theo Hành lang & Giờ trong ngày
                </span>
              </Space>
            }
            extra={
              <Space size={8}>
                <Tag color="green" style={{ borderRadius: 6 }}>
                  Tốt (&lt;1.1)
                </Tag>
                <Tag color="gold" style={{ borderRadius: 6 }}>
                  Trung bình (1.1-1.3)
                </Tag>
                <Tag color="orange" style={{ borderRadius: 6 }}>
                  Chậm (1.3-1.5)
                </Tag>
                <Tag color="red" style={{ borderRadius: 6 }}>
                  Ùn tắc (&gt;1.5)
                </Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Text
              type="secondary"
              style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
            >
              Ô tối màu = hành lang & khung giờ cần ưu tiên. Hover vào từng ô để
              xem giá trị TTI cụ thể.
            </Text>
            {heatmapRows.length === 0 ? (
              <EmptyState message="Chưa có dữ liệu bản đồ nhiệt" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    minWidth: 800,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: '6px 12px',
                          fontSize: 12,
                          color: '#555',
                          minWidth: 180,
                          borderBottom: '2px solid #f0f0f0',
                        }}
                      >
                        Tên hành lang
                      </th>
                      {heatmapHours.map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: 'center',
                            padding: '4px 2px',
                            fontSize: 11,
                            color: '#888',
                            borderBottom: '2px solid #f0f0f0',
                          }}
                        >
                          {h}h
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRows.map((row) => (
                      <tr key={row.corridorKey}>
                        <td
                          style={{
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid #f5f5f5',
                          }}
                        >
                          {row.corridorName}
                        </td>
                        {row.cells.map((cell, idx) => (
                          <td
                            key={idx}
                            title={
                              cell === null
                                ? 'Không có dữ liệu'
                                : `TTI: ${cell.toFixed(2)} — ${getTtiLabel(cell)}`
                            }
                            style={{
                              width: 28,
                              height: 28,
                              background: getHeatColor(cell),
                              textAlign: 'center',
                              fontSize: 10,
                              cursor: 'default',
                              borderBottom: '1px solid rgba(255,255,255,0.5)',
                              transition: 'all 0.15s',
                              color:
                                cell !== null && cell >= 1.5
                                  ? '#fff'
                                  : 'rgba(0,0,0,0.7)',
                              fontWeight: cell !== null && cell >= 1.3 ? 600 : 400,
                            }}
                          >
                            {cell !== null ? cell.toFixed(1) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ─── PHẦN E: ƯU TIÊN CAN THIỆP ─── */}
          <Title
            level={5}
            style={{ margin: '0 0 12px', color: '#555', letterSpacing: 0.2 }}
          >
            <FireOutlined style={{ marginRight: 6, color: '#F5222D' }} />
            Ưu tiên can thiệp vận hành
          </Title>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <BarChartOutlined style={{ color: '#F5222D' }} />
                    <span>
                      {rankingMode === 'segment'
                        ? 'Xếp hạng các phân đoạn gây trễ nhiều nhất'
                        : 'Xếp hạng hành lang theo tổng thời gian trễ'}
                    </span>
                  </Space>
                }
              >
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                >
                  {rankingMode === 'segment'
                    ? 'Top 10 segment trong hành lang đang chọn được xếp theo tổng thời gian trễ từ dữ liệu thật.'
                    : 'Hành lang đứng đầu = ưu tiên số một trong phân bổ lực lượng xử lý. Màu đỏ = cần can thiệp ngay.'}
                </Text>
                <div style={{ height: 280 }}>
                  {(
                    rankingMode === 'segment'
                      ? topDelaySegments.length > 0
                      : topDelayCorridors.length > 0
                  ) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart
                        data={rankingBarData}
                        layout="vertical"
                        margin={{ top: 8, right: 20, bottom: 8, left: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.06)"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value: number) =>
                            formatDuration(Number(value))
                          }
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          width={rankingMode === 'segment' ? 80 : 160}
                        />
                        <RechartsTooltip
                          content={<SegmentRankingTooltip />}
                          wrapperStyle={{ pointerEvents: 'auto' }}
                        />
                        <RechartsBar
                          dataKey="totalDelay"
                          radius={[0, 6, 6, 0]}
                          name="Tổng trễ"
                        >
                          {rankingBarData.map((entry) => (
                            <Cell key={entry.id} fill={entry.fill} />
                          ))}
                          <LabelList
                            dataKey="totalDelay"
                            position="right"
                            formatter={(val: any) => formatDuration(Number(val || 0))}
                            style={{ fontSize: 10, fill: '#666', fontWeight: 500 }}
                          />
                        </RechartsBar>
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu xếp hạng" />
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <FireOutlined style={{ color: '#722ed1' }} />
                    <span>Điểm nghẽn cổ chai thường xuyên</span>
                  </Space>
                }
              >
                <Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
                >
                  Đoạn đường thường xuyên trở thành điểm nghẽn — ưu tiên khảo
                  sát hạ tầng tại đây.
                </Text>
                <div style={{ height: 280 }}>
                  {bottleneckRechartsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart
                        data={bottleneckRechartsData}
                        layout="vertical"
                        margin={{ top: 8, right: 30, bottom: 8, left: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(0,0,0,0.06)"
                        />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          domain={[0, 'dataMax + 2']}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          width={80}
                        />
                        <RechartsTooltip />
                        <RechartsBar
                          dataKey="count"
                          fill="#722ed1"
                          radius={[0, 4, 4, 0]}
                          name="Số lần xuất hiện"
                        >
                          <LabelList
                            dataKey="count"
                            position="right"
                            style={{
                              fontSize: 11,
                              fill: '#722ed1',
                              fontWeight: 600,
                            }}
                          />
                        </RechartsBar>
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState message="Chưa có dữ liệu điểm nghẽn" />
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  )
}
