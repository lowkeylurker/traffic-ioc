// Corridor Analytics Tab — Tổng quan & Phân tích Hành lang
// Redesigned for government traffic operations officers

import { LineChart } from '@/components/charts/ChartComponents'
import { EmptyState, ErrorState, Loading } from '@/components/common'
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
  DashboardOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  FireOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Badge,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { Bar } from 'react-chartjs-2'
import dayjs, { Dayjs } from 'dayjs'
import CountUp from 'react-countup'
import { useEffect, useMemo, useState } from 'react'

const { Text, Title } = Typography

const createCountUpFormatter = (decimals = 0) => {
  // eslint-disable-next-line react/display-name
  return (value: string | number | undefined) => {
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return value ?? 'N/A'
    return (
      <CountUp end={numericValue} duration={0.9} separator="," decimals={decimals} />
    )
  }
}

const formatSeconds = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '--'
  if (seconds < 60) return `${Math.round(seconds)} giây`
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.round(seconds % 60)
  return `${minutes} phút${remaining > 0 ? ` ${remaining} giây` : ''}`
}

// Determine operational status based on KPIs
const getOperationalStatus = (
  isBelowTargetSpeed: boolean,
  isHighTti: boolean,
  isHighIncidentCount: boolean
): { level: 'success' | 'warning' | 'error'; label: string; description: string } => {
  const alertCount = [isBelowTargetSpeed, isHighTti, isHighIncidentCount].filter(Boolean).length
  if (alertCount === 0) return { level: 'success', label: 'Vận hành bình thường', description: 'Tất cả chỉ số trong ngưỡng cho phép' }
  if (alertCount === 1) return { level: 'warning', label: 'Cần theo dõi', description: 'Phát hiện 1 chỉ số cần chú ý' }
  return { level: 'error', label: 'Cần can thiệp', description: `Phát hiện ${alertCount} chỉ số vượt ngưỡng` }
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

export const CorridorAnalyticsTab: React.FC<CorridorAnalyticsTabProps> = ({
  selectedDate: externalDate,
}) => {
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<string | undefined>(undefined)
  const [selectedDate, setSelectedDate] = useState<Dayjs>(externalDate ?? dayjs())

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
    () => corridors.map((c) => ({ value: c.corridorKey, label: c.corridorName })),
    [corridors]
  )
  const effectiveCorridor = selectedCorridorKey ?? corridorOptions[0]?.value

  useEffect(() => {
    if (!selectedCorridorKey && corridorOptions[0]?.value) {
      setSelectedCorridorKey(corridorOptions[0].value)
    }
  }, [corridorOptions, selectedCorridorKey])

  const selectedCorridorName = corridorOptions.find((c) => c.value === effectiveCorridor)?.label ?? 'Hành lang'

  const twoDecFmt = useMemo(() => createCountUpFormatter(2), [])
  const zeroDecFmt = useMemo(() => createCountUpFormatter(0), [])

  const opStatus = useMemo(
    () => getOperationalStatus(
      dash.alerts.isBelowTargetSpeed,
      dash.alerts.isHighTti,
      dash.alerts.isHighIncidentCount,
    ),
    [dash.alerts]
  )

  const speedVsTargetChartData = {
    labels: dash.speedVsTarget.map((item) => `${item.hour.toString().padStart(2, '0')}:00`),
    datasets: [
      {
        label: 'Tốc độ thực tế (km/h)',
        data: dash.speedVsTarget.map((item) => item.avgCorridorSpeed),
        borderColor: dash.alerts.isBelowTargetSpeed ? '#F5222D' : '#52C41A',
        backgroundColor: dash.alerts.isBelowTargetSpeed
          ? 'rgba(245,34,45,0.12)'
          : 'rgba(82,196,26,0.12)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: 'Mục tiêu vận hành (km/h)',
        data: dash.speedVsTarget.map((item) => item.targetAvgSpeed),
        borderColor: '#1677ff',
        backgroundColor: 'rgba(22,119,255,0.08)',
        borderWidth: 2,
        borderDash: [6, 3],
        tension: 0.25,
        pointRadius: 1,
      },
    ],
  }

  const ttiChartData = {
    labels: dash.ttiHourly.map((item) => `${item.hour.toString().padStart(2, '0')}:00`),
    datasets: [
      {
        label: 'Chỉ số kéo dài hành trình (TTI)',
        data: dash.ttiHourly.map((item) => item.travelTimeIndex),
        borderColor: '#FA8C16',
        backgroundColor: 'rgba(250,140,22,0.15)',
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        pointRadius: (context: { dataIndex: number }) => {
          const val = dash.ttiHourly[context.dataIndex]?.travelTimeIndex ?? 1
          return val >= 1.5 ? 5 : 2
        },
        pointBackgroundColor: (context: { dataIndex: number }) => {
          const val = dash.ttiHourly[context.dataIndex]?.travelTimeIndex ?? 1
          return val >= 1.5 ? '#F5222D' : '#FA8C16'
        },
      },
      {
        label: 'Ngưỡng cảnh báo (1.3)',
        data: dash.ttiHourly.map(() => 1.3),
        borderColor: 'rgba(255,77,79,0.45)',
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
      },
    ],
  }

  const rankingChartData = {
    labels: dash.topDelayCorridors.map((item) => item.corridorName),
    datasets: [
      {
        label: 'Tổng thời gian trễ (giây)',
        data: dash.topDelayCorridors.map((item) => item.totalDelaySeconds),
        backgroundColor: dash.topDelayCorridors.map((_, idx) =>
          idx === 0 ? 'rgba(245,34,45,0.75)' : idx === 1 ? 'rgba(250,140,22,0.7)' : 'rgba(255,77,79,0.55)'
        ),
        borderColor: dash.topDelayCorridors.map((_, idx) =>
          idx === 0 ? '#F5222D' : idx === 1 ? '#FA8C16' : '#ff4d4f'
        ),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const bottleneckChartData = {
    labels: dash.topBottlenecks.map((item) => `Seg ${item.segmentKey}`),
    datasets: [
      {
        label: 'Số lần trở thành điểm nghẽn',
        data: dash.topBottlenecks.map((item) => item.count),
        backgroundColor: 'rgba(114,46,209,0.65)',
        borderColor: '#722ed1',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  // Heatmap data
  const heatmapHours = Array.from({ length: 24 }, (_, i) => i)
  const heatmapRows = useMemo(() => {
    const grouped = new Map<string, { corridorName: string; values: Map<number, number | null> }>()
    dash.heatmap.forEach((cell) => {
      if (!grouped.has(cell.corridorKey)) {
        grouped.set(cell.corridorKey, { corridorName: cell.corridorName, values: new Map() })
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

  const chartBaseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 12 }, boxWidth: 14 } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 } } },
    },
  }

  if (corridorsLoading || corridors.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loading />
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* ─── PHẦN A: BỘ LỌC + KPI ─── */}
      <Card
        style={{ marginBottom: 16, background: 'linear-gradient(135deg,#f8f9fe 0%,#eef2fb 100%)', border: '1px solid #e8ecf5' }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} md={12} lg={8}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <FilterOutlined style={{ marginRight: 4 }} />Chọn hành lang
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
                <CalendarOutlined style={{ marginRight: 4 }} />Chọn ngày phân tích
              </Text>
              <DatePicker
                value={selectedDate}
                format="DD/MM/YYYY"
                onChange={(val) => { if (val) setSelectedDate(val) }}
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
                  opStatus.level === 'success' ? <CheckCircleOutlined /> :
                  opStatus.level === 'warning' ? <ExclamationCircleOutlined /> :
                  <AlertOutlined />
                }
                color={opStatus.level === 'success' ? 'success' : opStatus.level === 'warning' ? 'warning' : 'error'}
                style={{ fontSize: 13, padding: '6px 14px', borderRadius: 20 }}
              >
                {opStatus.label}
              </Tag>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{opStatus.description}</Text>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {corridorLoading ? (
        <Loading />
      ) : corridorError ? (
        <ErrorState message={corridorError} />
      ) : (
        <>
          {/* KPI Cards */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} hoverable>
                <Statistic
                  title={
                    <Tooltip title="Tốc độ trung bình thực tế của toàn hành lang trong ngày">
                      <span><DashboardOutlined style={{ color: '#1677ff', marginRight: 4 }} />Tốc độ TB</span>
                    </Tooltip>
                  }
                  value={dash.kpis.avgCorridorSpeed ?? 0}
                  precision={1}
                  suffix="km/h"
                  formatter={twoDecFmt}
                  valueStyle={{ color: dash.alerts.isBelowTargetSpeed ? '#F5222D' : '#52C41A', fontSize: 22, fontWeight: 700 }}
                />
                {dash.kpis.targetAvgSpeed !== null && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Mục tiêu: {dash.kpis.targetAvgSpeed.toFixed(1)} km/h
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} hoverable>
                <Statistic
                  title={
                    <Tooltip title="Chỉ số TTI > 1.3 = hành trình kéo dài đáng kể; > 1.5 = ùn tắc">
                      <span><ClockCircleOutlined style={{ color: '#FA8C16', marginRight: 4 }} />Chỉ số TTI</span>
                    </Tooltip>
                  }
                  value={dash.kpis.travelTimeIndex ?? 0}
                  precision={2}
                  formatter={twoDecFmt}
                  valueStyle={{ color: getTtiColor(dash.kpis.travelTimeIndex), fontSize: 22, fontWeight: 700 }}
                />
                <Text style={{ fontSize: 11, color: getTtiColor(dash.kpis.travelTimeIndex) }}>
                  {getTtiLabel(dash.kpis.travelTimeIndex)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} hoverable>
                <Statistic
                  title={
                    <Tooltip title="Tổng thời gian mất mát của các xe trên hành lang trong ngày">
                      <span><FireOutlined style={{ color: '#F5222D', marginRight: 4 }} />Tổng trễ</span>
                    </Tooltip>
                  }
                  value={dash.kpis.totalDelaySeconds ?? 0}
                  precision={0}
                  suffix="giây"
                  formatter={zeroDecFmt}
                  valueStyle={{ color: '#F5222D', fontSize: 22, fontWeight: 700 }}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  ≈ {formatSeconds(dash.kpis.totalDelaySeconds)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} hoverable>
                <Statistic
                  title={
                    <Tooltip title="Hiệu suất vận hành: 1.0 = tối ưu hoàn toàn; < 0.7 = cần xem xét">
                      <span><ThunderboltOutlined style={{ color: '#722ed1', marginRight: 4 }} />Hiệu suất</span>
                    </Tooltip>
                  }
                  value={(dash.kpis.corridorEfficiency ?? 0) * 100}
                  precision={1}
                  suffix="%"
                  formatter={twoDecFmt}
                  valueStyle={{ color: (dash.kpis.corridorEfficiency ?? 0) >= 0.75 ? '#52C41A' : '#FA8C16', fontSize: 22, fontWeight: 700 }}
                />
                <Text style={{ fontSize: 11, color: '#666' }}>
                  {getEfficiencyLabel(dash.kpis.corridorEfficiency)}
                </Text>
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%' }} hoverable>
                <Statistic
                  title={
                    <Tooltip title="Sự cố đang hoạt động ảnh hưởng đến hành lang này">
                      <span><AlertOutlined style={{ color: '#fa8c16', marginRight: 4 }} />Sự cố</span>
                    </Tooltip>
                  }
                  value={dash.kpis.activeIncidentCount ?? 0}
                  precision={0}
                  suffix="sự cố"
                  formatter={zeroDecFmt}
                  valueStyle={{ color: (dash.kpis.activeIncidentCount ?? 0) > 0 ? '#FA8C16' : '#52C41A', fontSize: 22, fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={8} lg={4}>
              <Card size="small" style={{ textAlign: 'center', height: '100%', background: '#fafafa' }} hoverable>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>
                  <BarChartOutlined style={{ marginRight: 4 }} />So với baseline
                </Text>
                <Space direction="vertical" size={4}>
                  {dash.baselineComparison.speedDeltaPct !== null && (
                    <Text style={{ fontSize: 13 }}>
                      Tốc độ{' '}
                      {dash.baselineComparison.speedDeltaPct >= 0 ? (
                        <Text style={{ color: '#52C41A', fontWeight: 600 }}>
                          <ArrowUpOutlined />+{dash.baselineComparison.speedDeltaPct.toFixed(1)}%
                        </Text>
                      ) : (
                        <Text style={{ color: '#F5222D', fontWeight: 600 }}>
                          <ArrowDownOutlined />{dash.baselineComparison.speedDeltaPct.toFixed(1)}%
                        </Text>
                      )}
                    </Text>
                  )}
                  {dash.baselineComparison.delayDeltaPct !== null && (
                    <Text style={{ fontSize: 13 }}>
                      Trễ{' '}
                      {dash.baselineComparison.delayDeltaPct <= 0 ? (
                        <Text style={{ color: '#52C41A', fontWeight: 600 }}>
                          <ArrowDownOutlined />{dash.baselineComparison.delayDeltaPct.toFixed(1)}%
                        </Text>
                      ) : (
                        <Text style={{ color: '#F5222D', fontWeight: 600 }}>
                          <ArrowUpOutlined />+{dash.baselineComparison.delayDeltaPct.toFixed(1)}%
                        </Text>
                      )}
                    </Text>
                  )}
                  {dash.baselineComparison.speedDeltaPct === null && dash.baselineComparison.delayDeltaPct === null && (
                    <Text type="secondary" style={{ fontSize: 12 }}>Chưa có baseline</Text>
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          {/* ─── PHẦN B: CẢNH BÁO VẬN HÀNH ─── */}
          {(dash.alerts.isBelowTargetSpeed || dash.alerts.isHighTti || dash.alerts.isHighIncidentCount) && (
            <Card
              style={{ marginBottom: 16, border: '1px solid #ffccc7', background: '#fff2f0' }}
              bodyStyle={{ padding: '12px 20px' }}
            >
              <Space size={16} wrap>
                <Text strong style={{ color: '#cf1322' }}>
                  <AlertOutlined style={{ marginRight: 6 }} />
                  Cảnh báo hoạt động:
                </Text>
                {dash.alerts.isBelowTargetSpeed && (
                  <Alert
                    type="error"
                    showIcon
                    message="Tốc độ dưới mục tiêu — có nguy cơ ảnh hưởng luồng giao thông"
                    style={{ padding: '4px 12px', borderRadius: 8 }}
                  />
                )}
                {dash.alerts.isHighTti && (
                  <Alert
                    type="warning"
                    showIcon
                    message="TTI cao — thời gian di chuyển kéo dài bất thường"
                    style={{ padding: '4px 12px', borderRadius: 8 }}
                  />
                )}
                {dash.alerts.isHighIncidentCount && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Số sự cố cao — cần xem xét phương án phân luồng"
                    style={{ padding: '4px 12px', borderRadius: 8 }}
                  />
                )}
              </Space>
            </Card>
          )}

          {/* ─── PHẦN C: XU HƯỚNG TRONG NGÀY ─── */}
          <Title level={5} style={{ margin: '0 0 12px', color: '#555', letterSpacing: 0.2 }}>
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
                    status={dash.alerts.isBelowTargetSpeed ? 'error' : 'success'}
                    text={dash.alerts.isBelowTargetSpeed ? 'Dưới mục tiêu' : 'Đạt mục tiêu'}
                  />
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  Vùng màu đỏ chỉ ra các khung giờ tốc độ thực tế thấp hơn mức vận hành kỳ vọng.
                </Text>
                <div style={{ height: 280 }}>
                  {dash.speedVsTarget.length > 0 ? (
                    <LineChart
                      data={speedVsTargetChartData}
                      options={{
                        ...chartBaseOptions,
                        scales: {
                          ...chartBaseOptions.scales,
                          y: { ...chartBaseOptions.scales.y, title: { display: true, text: 'Tốc độ (km/h)' } },
                          x: { ...chartBaseOptions.scales.x, title: { display: true, text: 'Giờ trong ngày' } },
                        },
                      }}
                    />
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
                    <Text type="secondary" style={{ fontSize: 12 }}>TTI là gì?</Text>
                  </Tooltip>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  Đường đỏ đứt là ngưỡng cảnh báo (1.3). Điểm đỏ = giờ cần ưu tiên can thiệp.
                </Text>
                <div style={{ height: 280 }}>
                  {dash.ttiHourly.length > 0 ? (
                    <LineChart
                      data={ttiChartData}
                      options={{
                        ...chartBaseOptions,
                        scales: {
                          ...chartBaseOptions.scales,
                          y: { ...chartBaseOptions.scales.y, min: 0.8, title: { display: true, text: 'TTI' } },
                          x: { ...chartBaseOptions.scales.x, title: { display: true, text: 'Giờ trong ngày' } },
                        },
                      }}
                    />
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
                <span>Bản đồ nhiệt — Chỉ số TTI theo Hành lang & Giờ trong ngày</span>
              </Space>
            }
            extra={
              <Space size={8}>
                <Tag color="green" style={{ borderRadius: 6 }}>Tốt (&lt;1.1)</Tag>
                <Tag color="gold" style={{ borderRadius: 6 }}>Trung bình (1.1-1.3)</Tag>
                <Tag color="orange" style={{ borderRadius: 6 }}>Chậm (1.3-1.5)</Tag>
                <Tag color="red" style={{ borderRadius: 6 }}>Ùn tắc (&gt;1.5)</Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
              Ô tối màu = hành lang & khung giờ cần ưu tiên. Hover vào từng ô để xem giá trị TTI cụ thể.
            </Text>
            {heatmapRows.length === 0 ? (
              <EmptyState message="Chưa có dữ liệu bản đồ nhiệt" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 12px', fontSize: 12, color: '#555', minWidth: 180, borderBottom: '2px solid #f0f0f0' }}>
                        Tên hành lang
                      </th>
                      {heatmapHours.map((h) => (
                        <th key={h} style={{ textAlign: 'center', padding: '4px 2px', fontSize: 10, color: '#888', borderBottom: '2px solid #f0f0f0' }}>
                          {h}h
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRows.map((row) => (
                      <tr key={row.corridorKey}>
                        <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '1px solid #f5f5f5' }}>
                          {row.corridorName}
                        </td>
                        {row.cells.map((cell, idx) => (
                          <td
                            key={idx}
                            title={cell === null ? 'Không có dữ liệu' : `TTI: ${cell.toFixed(2)} — ${getTtiLabel(cell)}`}
                            style={{
                              width: 28,
                              height: 28,
                              background: getHeatColor(cell),
                              textAlign: 'center',
                              fontSize: 9,
                              cursor: 'default',
                              borderBottom: '1px solid rgba(255,255,255,0.5)',
                              transition: 'opacity 0.15s',
                              color: cell !== null && cell >= 1.5 ? '#fff' : 'transparent',
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
          <Title level={5} style={{ margin: '0 0 12px', color: '#555', letterSpacing: 0.2 }}>
            <FireOutlined style={{ marginRight: 6, color: '#F5222D' }} />
            Ưu tiên can thiệp vận hành
          </Title>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <BarChartOutlined style={{ color: '#F5222D' }} />
                    <span>Xếp hạng hành lang theo tổng thời gian trễ</span>
                  </Space>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  Hành lang đứng đầu = ưu tiên số một trong phân bổ lực lượng xử lý. Màu đỏ = cần can thiệp ngay.
                </Text>
                <div style={{ height: 280 }}>
                  {dash.topDelayCorridors.length > 0 ? (
                    <Bar
                      data={rankingChartData}
                      options={{
                        ...chartBaseOptions,
                        indexAxis: 'y' as const,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { ...chartBaseOptions.scales.x, title: { display: true, text: 'Tổng độ trễ (giây)' } },
                          y: { ...chartBaseOptions.scales.y, ticks: { font: { size: 11 } } },
                        },
                      }}
                    />
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
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  Đoạn đường thường xuyên trở thành điểm nghẽn — ưu tiên khảo sát hạ tầng tại đây.
                </Text>
                <div style={{ height: 280 }}>
                  {dash.topBottlenecks.length > 0 ? (
                    <Bar
                      data={bottleneckChartData}
                      options={{
                        ...chartBaseOptions,
                        indexAxis: 'y' as const,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { ...chartBaseOptions.scales.x, title: { display: true, text: 'Số lần xuất hiện' }, ticks: { stepSize: 1 } },
                          y: { ...chartBaseOptions.scales.y, ticks: { font: { size: 11 } } },
                        },
                      }}
                    />
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
