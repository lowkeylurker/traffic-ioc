import { TrafficMap } from '@/components/map/TrafficMap'
import { LOS_COLORS } from '@/config/constants'
import { useTrafficMap } from '@/hooks/useTraffic'
import { historyApi, mapApi } from '@/services/api'
import {
  HistoryHotspotPoint,
  HistoryQueryParams,
  HistoryRecord,
  SegmentResponse,
  TrafficStatus,
} from '@/types'
import { formatDateTimeInTimeZone } from '@/utils/format'
import {
  ThunderboltOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SafetyCertificateOutlined,
  EnvironmentOutlined,
  FundOutlined,
  DiffOutlined,
  ExportOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from '@ant-design/icons'
import { exportToImage, exportToPdf } from '@/utils/exportUtils'
import { TrendCard } from './history/components/TrendCard'
import { HistoryFilterBar, HistoryFilterValues } from './history/components/HistoryFilterBar'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Grid,
  Menu,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import React, { useMemo, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Bar,
  BarChart,
  XAxis,
  YAxis,
} from 'recharts'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().subtract(1, 'day'), dayjs()]

const DONUT_DATA = [
  { name: 'ThongThoang', label: 'Thông thoáng', value: 60, color: '#52c41a' },
  { name: 'UnU', label: 'Ùn ứ', value: 25, color: '#fa8c16' },
  { name: 'KetCung', label: 'Kẹt cứng', value: 15, color: '#f5222d' },
]

const getStatusMeta = (trafficIndex: number | null) => {
  if (trafficIndex === null) {
    return {
      label: 'Không xác định',
      color: 'default' as const,
      badge: '#8c8c8c',
    }
  }

  if (trafficIndex <= 0.33) {
    return { label: 'Kẹt cứng', color: 'red' as const, badge: '#f5222d' }
  }

  if (trafficIndex <= 0.66) {
    return { label: 'Ùn ứ', color: 'orange' as const, badge: '#fa8c16' }
  }

  return {
    label: 'Thông thoáng',
    color: 'green' as const,
    badge: '#52c41a',
  }
}

const getHotspotColor = (trafficIndex: number) => {
  const clamped = Math.max(0, Math.min(1, trafficIndex))
  const channel = Math.round(240 - clamped * 120)
  return `rgb(${channel}, 50, 50)`
}

export const HistoricalQueryPage: React.FC = () => {
  const screens = useBreakpoint()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(DEFAULT_RANGE)
  const [selectedRoadKey, setSelectedRoadKey] = useState<string | undefined>()
  const [selectedSnapshotTime, setSelectedSnapshotTime] = useState<
    string | undefined
  >()
  const [filters, setFilters] = useState<
    Omit<HistoryQueryParams, 'page' | 'limit'>
  >({
    startDateTime: DEFAULT_RANGE[0].format('YYYY-MM-DDTHH:mm:ss'),
    endDateTime: DEFAULT_RANGE[1].format('YYYY-MM-DDTHH:mm:ss'),
  })
  const [exporting, setExporting] = useState(false)
  const [isComparisonMode, setIsComparisonMode] = useState(false)
  const [comparisonSnapshotTime, setComparisonSnapshotTime] = useState<
    string | undefined
  >()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const queryParams = useMemo<HistoryQueryParams>(
    () => ({
      page,
      limit: pageSize,
      ...filters,
      roadKey: selectedRoadKey,
    }),
    [filters, page, pageSize, selectedRoadKey]
  )

  const baseFilterParams = useMemo(
    () => ({
      startDateTime: filters.startDateTime,
      endDateTime: filters.endDateTime,
      roadKey: selectedRoadKey,
      roadName: filters.roadName,
      minTrafficIndex: filters.minTrafficIndex,
    }),
    [filters, selectedRoadKey]
  )

  const roadsQuery = useQuery({
    queryKey: ['history-roads-autocomplete'],
    queryFn: async () => {
      const response = await mapApi.getRoads()
      return response.data ?? []
    },
    staleTime: 60_000,
  })

  const historyQuery = useQuery({
    queryKey: ['history-data', queryParams],
    queryFn: async () => {
      const response = await historyApi.getHistory(queryParams)
      return response.data
    },
    placeholderData: keepPreviousData,
  })

  const summaryQuery = useQuery({
    queryKey: ['history-summary', baseFilterParams],
    queryFn: async () => {
      const response = await historyApi.getSummary(baseFilterParams)
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const handleExport = async () => {
    try {
      setExporting(true)
      const blob = await historyApi.exportHistory(baseFilterParams)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `traffic_report_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      message.error('Không thể xuất CSV. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const tableData = useMemo(
    () => historyQuery.data?.items ?? [],
    [historyQuery.data]
  )
  const totalItems = historyQuery.data?.totalItems ?? 0

  const hotspotsQuery = useQuery({
    queryKey: ['history-hotspots', baseFilterParams],
    queryFn: async () => {
      const response = await historyApi.getHotspots(baseFilterParams)
      return response.data ?? []
    },
    placeholderData: keepPreviousData,
  })

  const snapshotsQuery = useQuery({
    queryKey: ['history-snapshots', filters.startDateTime, filters.endDateTime],
    queryFn: async () => {
      const response = await mapApi.getStatusSnapshots({
        start: filters.startDateTime,
        end: filters.endDateTime,
        limit: 500,
      })
      return response.data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const comparisonStatusQuery = useQuery({
    queryKey: ['history-map-status-comparison', comparisonSnapshotTime],
    queryFn: async () => {
      if (!comparisonSnapshotTime) {
        return []
      }
      const response = await mapApi.getStatus({ asOf: comparisonSnapshotTime })
      return response.data ?? []
    },
    enabled: Boolean(isComparisonMode && comparisonSnapshotTime),
    staleTime: 5 * 60 * 1000,
  })

  const historySnapshotOptions = useMemo(() => {
    return (snapshotsQuery.data ?? []).map((value) => ({
      value,
      label: formatDateTimeInTimeZone(value),
    }))
  }, [snapshotsQuery.data])


  const liveMapData = useTrafficMap()
  const baseSegments = useMemo<SegmentResponse | null>(() => {
    if (!liveMapData?.features?.length) {
      return null
    }

    return {
      type: 'FeatureCollection',
      features: liveMapData.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          avgSpeed: undefined,
          losGrade: undefined,
          color: undefined,
          lastUpdated: feature.properties.lastUpdated,
          isCorridor: feature.properties.isCorridor,
        },
      })),
    }
  }, [liveMapData])

  const snapshotStatusQuery = useQuery({
    queryKey: ['history-map-status', selectedSnapshotTime],
    queryFn: async () => {
      if (!selectedSnapshotTime) {
        return []
      }
      const response = await mapApi.getStatus({ asOf: selectedSnapshotTime })
      return response.data ?? []
    },
    enabled: Boolean(selectedSnapshotTime),
    staleTime: 5 * 60 * 1000,
  })

  const snapshotMapData = useMemo<SegmentResponse | null>(() => {
    // If NOT in comparison mode, always show live data as requested (buttons hidden)
    if (!isComparisonMode) {
      return liveMapData
    }

    // In comparison mode, if no time selected, show empty/blank as requested
    if (!selectedSnapshotTime) {
      return null
    }

    if (!baseSegments?.features) {
      return null
    }

    const statusBySegment = new Map<string, TrafficStatus>()
    for (const status of snapshotStatusQuery.data ?? []) {
      statusBySegment.set(String(status.segmentId), status)
    }

    return {
      type: 'FeatureCollection',
      features: baseSegments.features.map((feature) => {
        const status = statusBySegment.get(String(feature.properties.segmentId))
        const los = String(status?.losGrade || 'N/A').toUpperCase()
        const derivedColor = status
          ? (LOS_COLORS[los] ?? feature.properties.color)
          : '#d9d9d9'

        return {
          ...feature,
          properties: {
            ...feature.properties,
            avgSpeed: status?.avgSpeed,
            losGrade: los,
            color: derivedColor,
            lastUpdated: status?.timestamp
              ? String(status.timestamp)
              : feature.properties.lastUpdated,
            isCorridor: status?.isCorridor ?? feature.properties.isCorridor,
          },
        }
      }),
    }
  }, [selectedSnapshotTime, isComparisonMode, liveMapData, baseSegments, snapshotStatusQuery.data])

  const comparisonMapData = useMemo<SegmentResponse | null>(() => {
    if (!isComparisonMode || !comparisonSnapshotTime) {
      return null
    }

    if (!baseSegments?.features) {
      return null
    }

    const statusBySegment = new Map<string, TrafficStatus>()
    for (const status of comparisonStatusQuery.data ?? []) {
      statusBySegment.set(String(status.segmentId), status)
    }

    return {
      type: 'FeatureCollection',
      features: baseSegments.features.map((feature) => {
        const status = statusBySegment.get(String(feature.properties.segmentId))
        const los = String(status?.losGrade || 'N/A').toUpperCase()
        const derivedColor = status
          ? (LOS_COLORS[los] ?? feature.properties.color)
          : '#d9d9d9'

        return {
          ...feature,
          properties: {
            ...feature.properties,
            avgSpeed: status?.avgSpeed,
            losGrade: los,
            color: derivedColor,
            lastUpdated: status?.timestamp
              ? String(status.timestamp)
              : feature.properties.lastUpdated,
            isCorridor: status?.isCorridor ?? feature.properties.isCorridor,
          },
        }
      }),
    }
  }, [
    comparisonSnapshotTime,
    isComparisonMode,
    baseSegments,
    comparisonStatusQuery.data,
  ])

  const topHotspots = useMemo<HistoryHotspotPoint[]>(() => {
    return (hotspotsQuery.data ?? []).slice(0, 5)
  }, [hotspotsQuery.data])

  const chartsLoading = historyQuery.isLoading || hotspotsQuery.isLoading

  const columns: ColumnsType<HistoryRecord> = [
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      sorter: (a, b) =>
        dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf(),
      render: (value: string) => formatDateTimeInTimeZone(value),
      width: 170,
    },
    {
      title: 'Tên đường',
      dataIndex: 'roadName',
      key: 'roadName',
      sorter: (a, b) => (a.roadName ?? '').localeCompare(b.roadName ?? ''),
      render: (value: string | null, record) =>
        value ?? `Segment ${record.segmentId}`,
      width: 180,
    },
    {
      title: 'Quận/Huyện',
      dataIndex: 'district',
      key: 'district',
      sorter: (a, b) => (a.district ?? '').localeCompare(b.district ?? ''),
      render: (value: string | null) => value ?? 'N/A',
      width: 130,
    },
    {
      title: 'Tốc độ TB (km/h)',
      dataIndex: 'avgSpeedKmh',
      key: 'avgSpeedKmh',
      sorter: (a, b) => (a.avgSpeedKmh ?? 0) - (b.avgSpeedKmh ?? 0),
      render: (value: number | null) =>
        value === null ? 'N/A' : Number(value).toFixed(1),
      width: 150,
      align: 'right',
    },
    {
      title: 'Traffic Index',
      dataIndex: 'trafficIndex',
      key: 'trafficIndex',
      sorter: (a, b) => (a.trafficIndex ?? 0) - (b.trafficIndex ?? 0),
      render: (value: number | null) =>
        value === null ? 'N/A' : Number(value).toFixed(2),
      width: 130,
      align: 'right',
    },
    {
      title: 'Trạng thái',
      key: 'status',
      sorter: (a, b) => (a.trafficIndex ?? 1) - (b.trafficIndex ?? 1),
      render: (_, record) => {
        const status = getStatusMeta(record.trafficIndex)
        return (
          <Badge
            color={status.badge}
            text={<Tag color={status.color}>{status.label}</Tag>}
          />
        )
      },
      width: 160,
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total: totalItems,
    showSizeChanger: true,
    pageSizeOptions: [10, 20, 50, 100],
  }

  return (
    <>
      <style>
        {`
          .ant-spin-nested-loading { height: 100%; }
          .ant-spin-container { display: flex; flex-direction: column; height: 100%; }
          .ant-table { flex: 1; min-height: 0 !important; overflow-y: hidden; }
          .ant-table-container { height: 100%; display: flex; flex-direction: column; }
          .ant-table-body { flex: 1; overflow-y: auto !important; max-height: 100% !important; height: 100%; }
        `}
      </style>
      <div
        id="historical-query-container"
        style={{
          padding: 16,
          height: '100%',
          minHeight: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          background: '#f5f7fa',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
          }}
        >
          {/* Header Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Title level={4} style={{ marginBottom: 0 }}>
                Tra cứu Lịch sử tình trạng giao thông
              </Title>
              <Text type="secondary">
                Báo cáo xu hướng và tình trạng giao thông trong quá khứ.
              </Text>
            </div>

            <Space>
              <Button
                icon={isSidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                {isSidebarCollapsed ? 'Hiện bộ lọc' : 'Thu gọn'}
              </Button>
              <Dropdown
                overlay={
                  <Menu>
                    <Menu.Item
                      key="png"
                      icon={<FileImageOutlined />}
                      onClick={() => exportToImage('historical-query-container', 'traffic-history')}
                    >
                      Xuất PNG
                    </Menu.Item>
                    <Menu.Item
                      key="pdf"
                      icon={<FilePdfOutlined />}
                      onClick={() => exportToPdf('historical-query-container', 'traffic-history')}
                    >
                      Xuất PDF
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button type="primary" icon={<ExportOutlined />}>
                  Xuất báo cáo
                </Button>
              </Dropdown>
            </Space>
          </div>

          {/* Insights Row */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              width: '100%',
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            {summaryQuery.data ? (
              <>
                <TrendCard
                  title="Vận tốc TB"
                  value={summaryQuery.data.avgSpeed.toFixed(1)}
                  unit="km/h"
                  trendData={summaryQuery.data.avgSpeedTrend.map((p) => ({ value: p.value }))}
                  color="#1890ff"
                  prefix={<ThunderboltOutlined />}
                />
                <TrendCard
                  title="Ùn tắc (Index)"
                  value={
                    summaryQuery.data.congestionTrend[
                      summaryQuery.data.congestionTrend.length - 1
                    ]?.value.toFixed(2) ?? '0.00'
                  }
                  trendData={summaryQuery.data.congestionTrend.map((p) => ({ value: p.value }))}
                  color="#fa8c16"
                  prefix={<FundOutlined />}
                />
                <TrendCard
                  title="Lưu lượng tổng"
                  value={(summaryQuery.data.totalPcu / 1000).toFixed(1)}
                  unit="k PCU"
                  trendData={[{ value: 40 }, { value: 60 }, { value: 80 }]}
                  color="#52c41a"
                  prefix={<DashboardOutlined />}
                />
                <TrendCard
                  title="Tổng độ trễ"
                  value={(summaryQuery.data.totalDelay / 3600).toFixed(1)}
                  unit="giờ"
                  trendData={[{ value: 20 }, { value: 40 }, { value: 70 }]}
                  color="#f5222d"
                  prefix={<ClockCircleOutlined />}
                />
                <TrendCard
                  title="Hiệu suất Flow"
                  value={(summaryQuery.data.flowEfficiency * 100).toFixed(0)}
                  unit="%"
                  trendData={[{ value: 80 }, { value: 75 }, { value: 82 }]}
                  color="#722ed1"
                  prefix={<CheckCircleOutlined />}
                />
                <TrendCard
                  title="Độ ổn định"
                  value={(summaryQuery.data.losStability * 100).toFixed(0)}
                  unit="%"
                  trendData={[{ value: 90 }, { value: 88 }, { value: 85 }]}
                  color="#13c2c2"
                  prefix={<SafetyCertificateOutlined />}
                />
                <Card
                  size="small"
                  bodyStyle={{ padding: '12px' }}
                  style={{
                    borderRadius: 12,
                    minWidth: 160,
                    flex: 1.5,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    border: 'none',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase' }}>
                    Điểm nóng nhất
                  </Text>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <EnvironmentOutlined style={{ color: '#f5222d', fontSize: 16 }} />
                    <Text strong style={{ fontSize: 14, color: '#cf1322' }} ellipsis>
                      {summaryQuery.data.worstRoad}
                    </Text>
                  </div>
                </Card>
              </>
            ) : (
              [...Array(7)].map((_, i) => (
                <Card key={i} loading size="small" style={{ minWidth: 160, flex: 1, borderRadius: 12 }} />
              ))
            )}
          </div>

          {/* Main Content Area */}
          <div
            style={{
              display: 'grid',
              gap: 8,
              flex: 1,
              gridTemplateColumns:
                screens.lg && !isSidebarCollapsed
                  ? 'minmax(260px, 1fr) minmax(0, 4fr)'
                  : 'minmax(0, 1fr)',
              alignItems: 'stretch',
              minHeight: 0,
              overflow: 'hidden',
              transition: 'grid-template-columns 0.3s ease',
            }}
          >
            {/* Sidebar Column */}
            {!isSidebarCollapsed && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minHeight: 0,
                  height: '100%',
                  maxHeight: '100%',
                  overflowY: screens.lg ? 'auto' : 'visible',
                  overflowX: 'hidden',
                  paddingRight: screens.lg ? 4 : 0,
                }}
              >
                <Card
                  title="Bộ lọc dữ liệu"
                  size="small"
                  style={{ borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}
                  bodyStyle={{ padding: 12 }}
                >
                  <HistoryFilterBar
                    roads={roadsQuery.data ?? []}
                    loading={historyQuery.isFetching}
                    exporting={exporting}
                    initialRange={dateRange}
                    onSearch={(values: HistoryFilterValues) => {
                      setFilters({
                        startDateTime: values.dateTimeRange[0].format('YYYY-MM-DDTHH:mm:ss'),
                        endDateTime: values.dateTimeRange[1].format('YYYY-MM-DDTHH:mm:ss'),
                        roadKey: values.roadKey,
                        minTrafficIndex: values.minTrafficIndex,
                      })
                      setPage(1)
                      setDateRange(values.dateTimeRange)
                    }}
                    onExport={() => handleExport()}
                    onRoadKeyChange={(rk) => setSelectedRoadKey(rk)}
                  />
                </Card>

                <Card
                  title="Phân bổ Trạng thái"
                  size="small"
                  style={{ borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}
                  bodyStyle={{ padding: 10 }}
                >
                  {chartsLoading ? (
                    <div style={{ height: 150, display: 'grid', placeItems: 'center' }}><Spin /></div>
                  ) : (
                    <div style={{ width: '100%', height: 150 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={DONUT_DATA}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={44}
                            outerRadius={64}
                          >
                            {DONUT_DATA.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card
                  title="Top 5 điểm nóng"
                  size="small"
                  style={{ borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.06)' }}
                  bodyStyle={{ padding: 10 }}
                >
                  {hotspotsQuery.isLoading ? (
                    <div style={{ height: 156, display: 'grid', placeItems: 'center' }}><Spin /></div>
                  ) : (
                    <div style={{ width: '100%', height: 156 }}>
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={topHotspots}>
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="roadName" width={100} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="trafficIndex" radius={[0, 4, 4, 0]}>
                            {topHotspots.map((item, idx) => (
                              <Cell key={idx} fill={getHotspotColor(item.trafficIndex)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Map & Table Column */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <Card
                title="Bản đồ nhiệt"
                size="small"
                style={{
                  borderRadius: 12,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                }}
                extra={
                  <Space>
                    <Button
                      size="small"
                      type={isComparisonMode ? 'primary' : 'default'}
                      icon={<DiffOutlined />}
                      onClick={() => {
                        setIsComparisonMode(!isComparisonMode)
                        // Do not default to selectedSnapshotTime, let it be blank initially
                      }}
                    >
                      {isComparisonMode ? 'Tắt so sánh' : 'So sánh'}
                    </Button>
                    {isComparisonMode && (
                      <>
                        <Select
                          size="small"
                          style={{ width: 160 }}
                          placeholder="Mốc giờ 1"
                          loading={snapshotsQuery.isFetching}
                          value={selectedSnapshotTime}
                          allowClear
                          options={historySnapshotOptions}
                          onChange={(value) => setSelectedSnapshotTime(value ?? undefined)}
                        />
                        <Select
                          size="small"
                          style={{ width: 160 }}
                          placeholder="Mốc giờ 2"
                          loading={snapshotsQuery.isFetching}
                          value={comparisonSnapshotTime}
                          allowClear
                          options={historySnapshotOptions}
                          onChange={(value) => setComparisonSnapshotTime(value ?? undefined)}
                        />
                      </>
                    )}
                  </Space>
                }
                bodyStyle={{ padding: 10, flex: 1, display: 'flex', minHeight: 0 }}
              >
                <div style={{ flex: 1, width: '100%', position: 'relative', display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    {isComparisonMode && (
                      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>
                        Bản đồ 1: {selectedSnapshotTime ? formatDateTimeInTimeZone(selectedSnapshotTime) : 'Trống'}
                      </div>
                    )}
                    <Spin spinning={snapshotStatusQuery.isFetching && isComparisonMode} wrapperClassName="h-full w-full">
                      <TrafficMap
                        segmentData={snapshotMapData}
                        style={{ height: '100%', width: '100%' }}
                        segmentStatusLayerEnabled
                        showHoverPopup={true}
                        minimalTooltip={true}
                        useVectorTiles={false} // Disable vector tiles for historical mapping as it needs direct GeoJSON merging
                      />
                    </Spin>
                  </div>
                  {isComparisonMode && (
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10 }}>
                        Bản đồ 2: {comparisonSnapshotTime ? formatDateTimeInTimeZone(comparisonSnapshotTime) : 'Trống'}
                      </div>
                      <Spin spinning={comparisonStatusQuery.isFetching} wrapperClassName="h-full w-full">
                        {comparisonMapData ? (
                          <TrafficMap
                            segmentData={comparisonMapData}
                            style={{ height: '100%', width: '100%' }}
                            segmentStatusLayerEnabled
                            showHoverPopup={true}
                            minimalTooltip={true}
                            useVectorTiles={false}
                          />
                        ) : (
                          <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#f0f2f5', borderRadius: 8 }}>
                            <Text type="secondary">Chọn mốc giờ để so sánh</Text>
                          </div>
                        )}
                      </Spin>
                    </div>
                  )}
                </div>
              </Card>

              <Card
                size="small"
                style={{
                  borderRadius: 12,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
                  height: isSidebarCollapsed ? 400 : 300,
                  display: 'flex',
                  flexDirection: 'column',
                }}
                bodyStyle={{ padding: 10, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Space>
                    <Tag color="blue">{historyQuery.isFetching ? 'Đang cập nhật...' : 'Dữ liệu ổn định'}</Tag>
                    <Tag>Tổng số bản ghi: {totalItems}</Tag>
                  </Space>
                  <div style={{ marginLeft: 'auto' }}>
                    <Text type="secondary" italic style={{ fontSize: 12 }}>
                      Hiển thị dữ liệu từ {formatDateTimeInTimeZone(filters.startDateTime)} đến {formatDateTimeInTimeZone(filters.endDateTime)}
                    </Text>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <Table<HistoryRecord>
                    rowKey={(r) => `${r.timestamp}-${r.segmentId}`}
                    loading={historyQuery.isFetching}
                    columns={columns}
                    dataSource={tableData}
                    pagination={pagination}
                    size="small"
                    scroll={{ x: 1000, y: isSidebarCollapsed ? 280 : 180 }}
                    onChange={(p) => {
                      if (p.current) setPage(p.current)
                      if (p.pageSize) setPageSize(p.pageSize)
                    }}
                  />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
