import { TrafficMap } from '@/components/map/TrafficMap'
import { LOS_COLORS } from '@/config/constants'
import { useTrafficMap } from '@/hooks/useTraffic'
import { historyApi, mapApi } from '@/services/api'
import {
  HistoryHotspotPoint,
  HistoryQueryParams,
  HistoryRecord,
  RoadOption,
  SegmentResponse,
  TrafficStatus,
} from '@/types'
import { formatDateTimeInTimeZone } from '@/utils/format'
import { ExportOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  AutoComplete,
  Badge,
  Button,
  Card,
  DatePicker,
  Grid,
  Input,
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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const { RangePicker } = DatePicker
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
  const [quickSearch, setQuickSearch] = useState('')
  const [selectedRoadKey, setSelectedRoadKey] = useState<string | undefined>()
  const [selectedSnapshotTime, setSelectedSnapshotTime] = useState<
    string | undefined
  >()
  const [filters, setFilters] = useState<
    Omit<HistoryQueryParams, 'page' | 'limit'>
  >({
    startDateTime: DEFAULT_RANGE[0]
      .startOf('hour')
      .format('YYYY-MM-DDTHH:mm:ss'),
    endDateTime: DEFAULT_RANGE[1].startOf('hour').format('YYYY-MM-DDTHH:mm:ss'),
  })
  const [exporting, setExporting] = useState(false)

  const queryParams = useMemo<HistoryQueryParams>(
    () => ({
      page,
      limit: pageSize,
      ...filters,
      roadKey: selectedRoadKey,
      roadName: selectedRoadKey ? undefined : quickSearch.trim() || undefined,
    }),
    [filters, page, pageSize, quickSearch, selectedRoadKey]
  )

  const roadsQuery = useQuery({
    queryKey: ['history-roads-autocomplete'],
    queryFn: async () => {
      const response = await mapApi.getRoads()
      return response.data ?? []
    },
    staleTime: 60_000,
  })

  const roadOptions = useMemo(
    () =>
      (roadsQuery.data ?? []).map((road: RoadOption) => ({
        value: road.roadName,
        label: road.roadName,
        roadKey: road.roadKey,
      })),
    [roadsQuery.data]
  )

  const historyQuery = useQuery({
    queryKey: ['history-data', queryParams],
    queryFn: async () => {
      const response = await historyApi.getHistory(queryParams)
      return response.data
    },
    placeholderData: (previous) => previous,
  })

  const baseFilterParams = useMemo<Omit<HistoryQueryParams, 'page' | 'limit'>>(
    () => ({
      ...filters,
      roadKey: selectedRoadKey,
      roadName: selectedRoadKey ? undefined : quickSearch.trim() || undefined,
    }),
    [filters, quickSearch, selectedRoadKey]
  )

  const handleExport = async () => {
    try {
      setExporting(true)
      const blob = await historyApi.exportHistory(baseFilterParams)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'traffic_report.csv'
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
    [historyQuery.data?.items]
  )
  const totalItems = historyQuery.data?.totalItems ?? 0

  const hotspotsQuery = useQuery({
    queryKey: ['history-hotspots', baseFilterParams],
    queryFn: async () => {
      const response = await historyApi.getHotspots(baseFilterParams)
      return response.data ?? []
    },
    placeholderData: (previous) => previous,
  })

  const snapshotsQuery = useQuery({
    queryKey: ['history-snapshots', filters.startDateTime, filters.endDateTime],
    queryFn: async () => {
      const response = await mapApi.getStatusSnapshots({
        start: filters.startDateTime,
        end: filters.endDateTime,
        limit: 500, // Show up to 500 points in range
      })
      return response.data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const historySnapshotOptions = useMemo(() => {
    return (snapshotsQuery.data ?? []).map((value) => ({
      value,
      label: formatDateTimeInTimeZone(value),
    }))
  }, [snapshotsQuery.data])

  const activeSnapshotTime = useMemo(() => {
    const optionValues = new Set(historySnapshotOptions.map((opt) => opt.value))
    if (selectedSnapshotTime && optionValues.has(selectedSnapshotTime)) {
      return selectedSnapshotTime
    }
    return undefined
  }, [historySnapshotOptions, selectedSnapshotTime])

  const liveMapData = useTrafficMap()

  const snapshotStatusQuery = useQuery({
    queryKey: ['history-map-status', activeSnapshotTime],
    queryFn: async () => {
      if (!activeSnapshotTime) {
        return []
      }
      const response = await mapApi.getStatus({ asOf: activeSnapshotTime })
      return response.data ?? []
    },
    enabled: Boolean(activeSnapshotTime),
    staleTime: 5 * 60 * 1000,
  })

  const snapshotMapData = useMemo<SegmentResponse | null>(() => {
    if (!activeSnapshotTime) {
      return liveMapData
    }

    if (!liveMapData?.features) {
      return null
    }

    const statusBySegment = new Map<string, TrafficStatus>()
    for (const status of snapshotStatusQuery.data ?? []) {
      statusBySegment.set(String(status.segmentId), status)
    }

    return {
      type: 'FeatureCollection',
      features: liveMapData.features.map((feature) => {
        const status = statusBySegment.get(String(feature.properties.segmentId))
        const los = String(status?.losGrade || 'N/A').toUpperCase()
        const derivedColor = status
          ? (LOS_COLORS[los] ?? feature.properties.color)
          : undefined

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
  }, [activeSnapshotTime, liveMapData, snapshotStatusQuery.data])

  const topHotspots = useMemo<HistoryHotspotPoint[]>(() => {
    return (hotspotsQuery.data ?? []).slice(0, 5)
  }, [hotspotsQuery.data])

  const chartsLoading = historyQuery.isLoading || hotspotsQuery.isLoading
  const chartsReady = historyQuery.isSuccess && hotspotsQuery.isSuccess
  const mapCardLoading = activeSnapshotTime
    ? snapshotStatusQuery.isLoading
    : !liveMapData

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
      .ant-spin-nested-loading {
  height: 100%;
}

.ant-spin-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ant-table {
  flex: 1;
  min-height: 0 !important;
  overflow-y: hidden;
}

.ant-table-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ant-table-body {
  flex: 1;
  overflow-y: auto !important;
  max-height: 100% !important;
  height: 100%;
}
      `}
      </style>
      <div
        style={{
          padding: 16,
          height: '100%', // Use viewport height minus news ticker
          minHeight: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Title level={4} style={{ marginBottom: 0 }}>
              Tra cứu Lịch sử tình trạng giao thông
            </Title>
            <Text type="secondary">
              Cung cấp báo cáo lịch sử tình trạng giao thông, cho phép truy vấn
              và phân tích dữ liệu giao thông trong quá khứ, bao gồm tốc độ
              trung bình, chỉ số giao thông, và trạng thái tắc nghẽn.
            </Text>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 8,
              flex: 1,
              gridTemplateColumns: screens.lg
                ? 'minmax(260px, 1fr) minmax(0, 4fr)'
                : 'minmax(0, 1fr)',
              alignItems: 'stretch', // Ensure cards stretch to fill row height
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
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
                alignItems: 'stretch',
                justifyContent: 'flex-start',
              }}
            >
              <Card
                title="Phân bổ Trạng thái"
                size="small"
                style={{
                  borderRadius: 12,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
                }}
                bodyStyle={{ padding: 10 }}
              >
                {chartsLoading ? (
                  <div
                    style={{
                      width: '100%',
                      height: 150,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Spin tip="Đang tải biểu đồ" />
                  </div>
                ) : chartsReady ? (
                  <>
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
                            paddingAngle={3}
                          >
                            {DONUT_DATA.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${value}%`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div
                      style={{
                        marginTop: -92,
                        textAlign: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <Text strong style={{ fontSize: 14 }}>
                        Tổng: 430k
                      </Text>
                      <br />
                      <Text type="secondary">segments</Text>
                    </div>
                    <Space wrap size={6} style={{ marginTop: 4 }}>
                      {DONUT_DATA.map((item) => (
                        <Tag key={item.name} color={item.color}>
                          {item.label}: {item.value}%
                        </Tag>
                      ))}
                    </Space>
                  </>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 150,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#8c8c8c',
                      textAlign: 'center',
                      padding: 12,
                    }}
                  >
                    Chưa có dữ liệu biểu đồ.
                  </div>
                )}
              </Card>

              <Card
                title="Top 5 điểm nóng"
                size="small"
                style={{
                  borderRadius: 12,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
                }}
                bodyStyle={{ padding: 10 }}
              >
                {hotspotsQuery.isLoading ? (
                  <div
                    style={{
                      width: '100%',
                      height: 156,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Spin tip="Đang tải điểm nóng" />
                  </div>
                ) : topHotspots.length > 0 ? (
                  <div style={{ width: '100%', height: 156 }}>
                    <ResponsiveContainer>
                      <BarChart
                        layout="vertical"
                        data={topHotspots}
                        margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          domain={[0, 1]}
                          tickFormatter={(value) => value.toFixed(2)}
                        />
                        <YAxis
                          type="category"
                          dataKey="roadName"
                          width={120}
                          tick={{ fontSize: 12 }}
                          interval={0}
                        />
                        <Tooltip
                          formatter={(value) => Number(value ?? 0).toFixed(2)}
                        />
                        <Bar dataKey="trafficIndex" radius={[0, 8, 8, 0]}>
                          {topHotspots.map((item) => (
                            <Cell
                              key={item.roadName}
                              fill={getHotspotColor(item.trafficIndex)}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 156,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#8c8c8c',
                      textAlign: 'center',
                      padding: 12,
                    }}
                  >
                    Chưa có dữ liệu điểm nóng phù hợp bộ lọc hiện tại.
                  </div>
                )}
              </Card>

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
                  <Select
                    size="small"
                    style={{ width: 180 }}
                    placeholder="Chọn mốc giờ"
                    loading={snapshotsQuery.isFetching}
                    value={activeSnapshotTime}
                    allowClear
                    options={historySnapshotOptions}
                    onChange={(value) => {
                      setSelectedSnapshotTime(value ?? undefined)
                    }}
                  />
                }
                bodyStyle={{
                  padding: 10,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                }}
              >
                {mapCardLoading ? (
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Spin tip="Đang tải bản đồ theo mốc giờ" />
                  </div>
                ) : snapshotMapData ? (
                  <div style={{ flex: 1, width: '100%', position: 'relative' }}>
                    <TrafficMap
                      segmentData={snapshotMapData}
                      style={{ height: '100%', width: '100%' }}
                      segmentStatusLayerEnabled
                      useTomTomFlowTiles={false}
                      useTomTomIncidentTiles={false}
                      useVectorTiles={false}
                      showHoverPopup={false}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#8c8c8c',
                      textAlign: 'center',
                      padding: 12,
                    }}
                  >
                    Chưa có dữ liệu bản đồ cho mốc giờ này.
                  </div>
                )}
              </Card>
            </div>

            <Card
              title="Bảng dữ liệu chính"
              style={{
                borderRadius: 12,
                boxShadow: '0 8px 22px rgba(0,0,0,0.08)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              bodyStyle={{
                padding: 10,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Space wrap>
                  <RangePicker
                    value={dateRange}
                    showTime={{ format: 'HH:mm' }}
                    format="DD/MM/YYYY HH:mm"
                    onChange={(value) => {
                      if (!value || !value[0] || !value[1]) {
                        return
                      }
                      const start = value[0]
                      const end = value[1]
                      setDateRange([start, end])
                      setFilters((prev) => ({
                        ...prev,
                        startDateTime: start.format('YYYY-MM-DDTHH:mm:ss'),
                        endDateTime: end.format('YYYY-MM-DDTHH:mm:ss'),
                      }))
                      setPage(1)
                    }}
                  />
                  <Tag color="blue">
                    {historyQuery.isFetching
                      ? 'Đang tải dữ liệu'
                      : 'Đã cập nhật'}
                  </Tag>
                  <Tag>Tổng bản ghi: {totalItems}</Tag>
                </Space>

                <Space wrap style={{ marginLeft: screens.md ? 'auto' : 0 }}>
                  <AutoComplete
                    allowClear
                    options={roadOptions}
                    value={quickSearch}
                    filterOption={(inputValue, option) =>
                      String(option?.label ?? '')
                        .toLowerCase()
                        .includes(inputValue.toLowerCase())
                    }
                    onChange={(value) => {
                      setQuickSearch(value)
                      setSelectedRoadKey(undefined)
                      setPage(1)
                    }}
                    onSelect={(_, option) => {
                      setQuickSearch(String(option.label ?? ''))
                      setSelectedRoadKey(
                        String((option as { roadKey?: string }).roadKey ?? '')
                      )
                      setPage(1)
                    }}
                  >
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="Tìm đường..."
                      style={{ width: screens.md ? 280 : 220 }}
                    />
                  </AutoComplete>
                  <Button
                    type="default"
                    icon={<ExportOutlined />}
                    loading={exporting}
                    onClick={() => {
                      void handleExport()
                    }}
                  >
                    Xuất CSV
                  </Button>
                </Space>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Table<HistoryRecord>
                  rowKey={(record) => `${record.timestamp}-${record.segmentId}`}
                  loading={historyQuery.isFetching}
                  columns={columns}
                  dataSource={tableData}
                  pagination={pagination}
                  style={{ height: '100%' }}
                  scroll={{ x: 1100, y: 'calc(100% - 240px)' }}
                  onChange={(nextPagination) => {
                    if (nextPagination.current) {
                      setPage(nextPagination.current)
                    }
                    if (nextPagination.pageSize) {
                      setPageSize(nextPagination.pageSize)
                    }
                  }}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
