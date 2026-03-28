import { EmptyState, ErrorState, Loading } from '@/components/common'
import { analyticsApi } from '@/services/api'
import {
  CorridorAnalyticsOption,
  CorridorReliabilityData,
  ReliabilitySortBy,
  ReliabilityTimeWindow,
} from '@/types'
import {
  DatabaseOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  LayerProps,
  MapRef,
  NavigationControl,
  Source,
} from 'react-map-gl'
import { Doughnut } from 'react-chartjs-2'
import 'mapbox-gl/dist/mapbox-gl.css'

const { Text, Title } = Typography

type CorridorReliabilityItem = CorridorReliabilityData
type CorridorLimitOption = number | 'all'
type ReliabilitySortOption = 'buffer_index' | 'pti'

const RELIABILITY_LIMIT_ALL = 10000

interface CorridorSummaryRow {
  corridorKey: string
  corridorName: string
  segmentCount: number
  bufferIndexAvg: number
  ptiAvg: number
  tAvgSeconds: number
  tFreeflowSeconds: number
  rootCauses: {
    accident: number
    flood: number
    construction: number
  }
}

const toColorByBufferIndex = (bufferIndex: number) => {
  if (bufferIndex < 0.2) {
    return '#52c41a'
  }

  if (bufferIndex <= 0.4) {
    return '#faad14'
  }

  return '#cf1322'
}

const getLineMidpoint = (geometry: GeoJSON.LineString): [number, number] => {
  if (!geometry.coordinates.length) {
    return [106.7009, 10.7769]
  }

  const midIndex = Math.floor(geometry.coordinates.length / 2)
  const point = geometry.coordinates[midIndex]
  return [point[0], point[1]]
}

const sumOrZero = (values: Array<number | null | undefined>) => {
  const valid = values.filter(
    (value): value is number => value !== null && value !== undefined
  )

  if (valid.length === 0) {
    return 0
  }

  return valid.reduce((sum, value) => sum + value, 0)
}

const formatTravelTime = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '--'
  }

  if (seconds < 60) {
    return `${Math.round(seconds)} giây`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes} phút ${remainingSeconds} giây`
}

const fetchReliabilityCorridors = async (
  timeWindow: ReliabilityTimeWindow,
  sortBy: ReliabilitySortBy,
  limit: number,
  corridorKey?: string,
  signal?: AbortSignal
): Promise<CorridorReliabilityItem[]> => {
  const response = await analyticsApi.getCorridorReliability(
    {
      timeWindow,
      sortBy,
      limit,
      corridorKey,
    },
    signal
  )

  if (!response.success || !response.data) {
    return []
  }

  return response.data.map((item) => ({
    ...item,
    bufferIndex: item.bufferIndex ?? 0,
    pti: item.pti ?? 0,
    rootCauses: item.rootCauses ?? { accident: 0, flood: 0, construction: 0 },
  }))
}

export const CorridorReliabilityTab: React.FC = () => {
  const [timeWindow, setTimeWindow] = useState<ReliabilityTimeWindow>('AM_PEAK')
  const [segmentSortBy, setSegmentSortBy] =
    useState<ReliabilitySortOption>('buffer_index')
  const [corridorSortBy, setCorridorSortBy] =
    useState<ReliabilitySortOption>('buffer_index')
  const [corridorLimit, setCorridorLimit] = useState<CorridorLimitOption>(10)
  const [corridorOptions, setCorridorOptions] = useState<
    CorridorAnalyticsOption[]
  >([])
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<
    string | 'all'
  >('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CorridorReliabilityItem[]>([])
  const [activeSegmentKey, setActiveSegmentKey] = useState<string | null>(null)
  const [selectedCorridorAnalysis, setSelectedCorridorAnalysis] =
    useState<CorridorSummaryRow | null>(null)
  const mapRef = useRef<MapRef | null>(null)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapStyle =
    import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12'

  useEffect(() => {
    const controller = new AbortController()

    const loadCorridors = async () => {
      try {
        const response = await analyticsApi.getCorridors()
        if (!controller.signal.aborted) {
          setCorridorOptions(
            response.success && response.data ? response.data : []
          )
        }
      } catch {
        if (!controller.signal.aborted) {
          setCorridorOptions([])
        }
      }
    }

    loadCorridors()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchReliabilityCorridors(
          timeWindow,
          'buffer_index',
          RELIABILITY_LIMIT_ALL,
          undefined,
          controller.signal
        )
        setRows(result)
      } catch (fetchError) {
        if (
          fetchError instanceof Error &&
          fetchError.name === 'CanceledError'
        ) {
          return
        }

        setRows([])
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Không thể tải dữ liệu reliability corridor'
        )
      } finally {
        setLoading(false)
      }
    }

    loadData()

    return () => {
      controller.abort()
    }
  }, [timeWindow])

  const segmentRows = useMemo(() => {
    const filteredRows =
      selectedCorridorKey === 'all'
        ? rows
        : rows.filter((item) => item.corridorKey === selectedCorridorKey)

    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      const aValue =
        segmentSortBy === 'pti' ? (a.pti ?? 0) : (a.bufferIndex ?? 0)
      const bValue =
        segmentSortBy === 'pti' ? (b.pti ?? 0) : (b.bufferIndex ?? 0)
      return bValue - aValue
    })
    return sorted
  }, [rows, segmentSortBy, selectedCorridorKey])

  const focusSegmentOnMap = (segment: CorridorReliabilityItem) => {
    if (!segment.geometry || !mapRef.current) {
      return
    }

    const [longitude, latitude] = getLineMidpoint(segment.geometry)
    mapRef.current.flyTo({
      center: [longitude, latitude],
      zoom: 14,
      duration: 900,
      essential: true,
    })
  }

  const toggleSegmentSelection = (segment: CorridorReliabilityItem) => {
    if (activeSegmentKey === segment.segmentKey) {
      setActiveSegmentKey(null)
      return
    }

    setActiveSegmentKey(segment.segmentKey)
    focusSegmentOnMap(segment)
  }

  const mapGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: segmentRows
        .filter(
          (
            item
          ): item is CorridorReliabilityItem & {
            geometry: GeoJSON.LineString
          } => Boolean(item.geometry)
        )
        .map((item) => ({
          type: 'Feature',
          geometry: item.geometry,
          properties: {
            segmentKey: item.segmentKey,
            corridorId: item.corridorKey,
            corridorName: item.corridorName,
            bufferIndex: item.bufferIndex,
            lineColor: toColorByBufferIndex(item.bufferIndex ?? 0),
            isSelected: activeSegmentKey === item.segmentKey ? 1 : 0,
          },
        })),
    }),
    [activeSegmentKey, segmentRows]
  )

  const lineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-layer',
        type: 'line',
        paint: {
          'line-color': ['coalesce', ['get', 'lineColor'], '#52c41a'],
          'line-width': 5,
          'line-opacity': 0.9,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const selectedOutlineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-selected-outline-layer',
        type: 'line',
        filter: ['==', ['get', 'isSelected'], 1],
        paint: {
          'line-color': '#ffffff',
          'line-width': 10,
          'line-opacity': 0.95,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const selectedLineLayer = useMemo<LayerProps>(
    () =>
      ({
        id: 'reliability-corridor-selected-line-layer',
        type: 'line',
        filter: ['==', ['get', 'isSelected'], 1],
        paint: {
          'line-color': ['coalesce', ['get', 'lineColor'], '#cf1322'],
          'line-width': 7,
          'line-opacity': 1,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const rootCauseChartData = useMemo(() => {
    if (!selectedCorridorAnalysis) {
      return null
    }

    const labels = ['accident', 'flood', 'construction']
    const values = [
      selectedCorridorAnalysis.rootCauses?.accident ?? 0,
      selectedCorridorAnalysis.rootCauses?.flood ?? 0,
      selectedCorridorAnalysis.rootCauses?.construction ?? 0,
    ]
    const total = values.reduce((sum, value) => sum + value, 0)

    if (total <= 0) {
      return {
        labels: ['no_data'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#d9d9d9'],
            borderWidth: 1,
          },
        ],
      }
    }

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            '#1677ff',
            '#13c2c2',
            '#faad14',
            '#cf1322',
            '#722ed1',
          ],
          borderWidth: 1,
        },
      ],
    }
  }, [selectedCorridorAnalysis])

  const corridorSummaryRows = useMemo<CorridorSummaryRow[]>(() => {
    const grouped = new globalThis.Map<
      string,
      {
        corridorName: string
        segmentCount: number
        bufferSum: number
        ptiSum: number
      }
    >()

    rows.forEach((row) => {
      const existing = grouped.get(row.corridorKey)
      if (existing) {
        existing.segmentCount += 1
        existing.bufferSum += row.bufferIndex ?? 0
        existing.ptiSum += row.pti ?? 0
        return
      }

      grouped.set(row.corridorKey, {
        corridorName: row.corridorName,
        segmentCount: 1,
        bufferSum: row.bufferIndex ?? 0,
        ptiSum: row.pti ?? 0,
      })
    })

    const summaryRows = Array.from(grouped.entries()).map(
      ([corridorKey, value]) => {
        const corridorSegments = rows.filter(
          (item) => item.corridorKey === corridorKey
        )

        return {
          corridorKey,
          corridorName: value.corridorName,
          segmentCount: value.segmentCount,
          bufferIndexAvg:
            value.segmentCount > 0 ? value.bufferSum / value.segmentCount : 0,
          ptiAvg:
            value.segmentCount > 0 ? value.ptiSum / value.segmentCount : 0,
          tAvgSeconds: sumOrZero(corridorSegments.map((item) => item.tAvg)),
          tFreeflowSeconds: sumOrZero(
            corridorSegments.map((item) => item.tFreeflow)
          ),
          rootCauses: {
            accident: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.accident ?? 0),
              0
            ),
            flood: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.flood ?? 0),
              0
            ),
            construction: corridorSegments.reduce(
              (sum, item) => sum + (item.rootCauses?.construction ?? 0),
              0
            ),
          },
        }
      }
    )

    summaryRows.sort((a, b) => {
      const aValue = corridorSortBy === 'pti' ? a.ptiAvg : a.bufferIndexAvg
      const bValue = corridorSortBy === 'pti' ? b.ptiAvg : b.bufferIndexAvg
      return bValue - aValue
    })

    if (corridorLimit === 'all') {
      return summaryRows
    }

    return summaryRows.slice(0, corridorLimit)
  }, [corridorLimit, corridorSortBy, rows])

  const segmentTableColumns = [
    {
      title: 'Segment',
      dataIndex: 'segmentName',
      key: 'segmentName',
    },
    {
      title: 'Corridor',
      dataIndex: 'corridorName',
      key: 'corridorName',
    },
    {
      title: 'Buffer Index',
      dataIndex: 'bufferIndex',
      key: 'bufferIndex',
      render: (value: number) => (
        <Tag color={value < 0.2 ? 'green' : value <= 0.4 ? 'orange' : 'red'}>
          {value.toFixed(2)}
        </Tag>
      ),
    },
    {
      title: 'PTI',
      dataIndex: 'pti',
      key: 'pti',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: 'Tg di chuyển',
      dataIndex: 'tAvg',
      key: 'tAvg',
      render: (value: number | null) => formatTravelTime(value),
    },
    {
      title: 'Segment Key',
      dataIndex: 'segmentKey',
      key: 'segmentKey',
    },
  ]

  const corridorSummaryColumns = [
    {
      title: 'Corridor',
      dataIndex: 'corridorName',
      key: 'corridorName',
    },
    {
      title: 'Số segment',
      dataIndex: 'segmentCount',
      key: 'segmentCount',
    },
    {
      title: 'Buffer Index (TB)',
      dataIndex: 'bufferIndexAvg',
      key: 'bufferIndexAvg',
      render: (value: number) => (
        <Tag color={value < 0.2 ? 'green' : value <= 0.4 ? 'orange' : 'red'}>
          {value.toFixed(2)}
        </Tag>
      ),
    },
    {
      title: 'PTI (TB)',
      dataIndex: 'ptiAvg',
      key: 'ptiAvg',
      render: (value: number) => value.toFixed(2),
    },
    {
      title: 'Tg đi hết corridor',
      dataIndex: 'tAvgSeconds',
      key: 'tAvgSeconds',
      render: (value: number) => formatTravelTime(value),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, row: CorridorSummaryRow) => (
        <Button
          icon={<SearchOutlined />}
          type="text"
          onClick={() => setSelectedCorridorAnalysis(row)}
        >
          Phân tích
        </Button>
      ),
    },
  ]

  if (loading) {
    return <Loading />
  }

  if (error) {
    return <ErrorState message={error} />
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={
          <Space size={8}>
            <FilterOutlined />
            <span>Bộ lọc độ tin cậy corridor</span>
          </Space>
        }
      >
        <Space size={12} wrap>
          <Select
            style={{ minWidth: 220 }}
            value={timeWindow}
            onChange={(value: ReliabilityTimeWindow) => setTimeWindow(value)}
            options={[
              { label: 'Giờ cao điểm sáng', value: 'AM_PEAK' },
              { label: 'Giờ cao điểm chiều', value: 'PM_PEAK' },
              { label: 'Giờ bình thường', value: 'OFF_PEAK' },
            ]}
          />
          <Select
            style={{ minWidth: 260 }}
            value={selectedCorridorKey}
            onChange={(value: string | 'all') => setSelectedCorridorKey(value)}
            options={[
              { label: 'Tất cả corridor', value: 'all' },
              ...corridorOptions.map((corridor) => ({
                label: corridor.corridorName,
                value: corridor.corridorKey,
              })),
            ]}
          />
          <Select
            style={{ minWidth: 220 }}
            value={segmentSortBy}
            onChange={(value: ReliabilitySortBy) => setSegmentSortBy(value)}
            options={[
              { label: 'Segment sort: Buffer Index', value: 'buffer_index' },
              { label: 'Segment sort: PTI', value: 'pti' },
            ]}
          />
        </Space>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="Chưa có dữ liệu reliability corridor" />
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={10}>
            <Card
              title={
                <Space size={8}>
                  <DatabaseOutlined />
                  <span>Danh sách segment reliability</span>
                </Space>
              }
            >
              <Table<CorridorReliabilityItem>
                rowKey="segmentKey"
                columns={segmentTableColumns}
                dataSource={segmentRows}
                pagination={false}
                size="small"
                scroll={{ y: 420 }}
                onRow={(record) => ({
                  onClick: () => toggleSegmentSelection(record),
                })}
              />
            </Card>
          </Col>

          <Col xs={24} xl={14}>
            <Card title="Static heatmap reliability theo corridor">
              <Text
                type="secondary"
                style={{ display: 'block', marginBottom: 12 }}
              >
                Quy tắc màu: Xanh (&lt;0.2), Vàng/Cam (0.2-0.4), Đỏ sẫm
                (&gt;0.4).
              </Text>
              {mapboxToken ? (
                <div
                  style={{ height: 480, borderRadius: 8, overflow: 'hidden' }}
                >
                  <Map
                    ref={mapRef}
                    initialViewState={{
                      latitude: 10.7769,
                      longitude: 106.7009,
                      zoom: 11.3,
                    }}
                    mapStyle={mapStyle}
                    mapboxAccessToken={mapboxToken}
                  >
                    <NavigationControl position="top-right" />
                    <Source
                      id="reliability-corridor-source"
                      type="geojson"
                      data={mapGeoJson}
                    >
                      <Layer {...lineLayer} />
                      <Layer {...selectedOutlineLayer} />
                      <Layer {...selectedLineLayer} />
                    </Source>
                  </Map>
                </div>
              ) : (
                <ErrorState message="Thiếu VITE_MAPBOX_TOKEN để hiển thị heatmap corridor" />
              )}

              <Space size={8} style={{ marginTop: 12 }} wrap>
                <Tag color="green">Ổn định (&lt; 0.2)</Tag>
                <Tag color="orange">Thất thường (0.2 - 0.4)</Tag>
                <Tag color="red">Báo động (&gt; 0.4)</Tag>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {corridorSummaryRows.length > 0 && (
        <Card
          title={
            <Space size={8}>
              <DatabaseOutlined />
              <span>Bảng tổng hợp corridor reliability (TB theo segment)</span>
            </Space>
          }
          extra={
            <Space size={8}>
              <Select
                style={{ width: 220 }}
                value={corridorSortBy}
                onChange={(value: ReliabilitySortBy) =>
                  setCorridorSortBy(value)
                }
                options={[
                  {
                    label: 'Corridor sort: Buffer Index (TB)',
                    value: 'buffer_index',
                  },
                  { label: 'Corridor sort: PTI (TB)', value: 'pti' },
                ]}
              />
              <Select
                style={{ width: 140 }}
                value={corridorLimit}
                onChange={(value: CorridorLimitOption) =>
                  setCorridorLimit(value)
                }
                options={[
                  { label: 'All', value: 'all' },
                  { label: 'Top 5', value: 5 },
                  { label: 'Top 10', value: 10 },
                  { label: 'Top 15', value: 15 },
                ]}
              />
            </Space>
          }
        >
          <Table<CorridorSummaryRow>
            rowKey="corridorKey"
            columns={corridorSummaryColumns}
            dataSource={corridorSummaryRows}
            pagination={false}
            size="small"
            scroll={{ y: 360 }}
            onRow={(record) => ({
              onClick: () => {
                const segmentFromAllRows = rows.find(
                  (segment) => segment.corridorKey === record.corridorKey
                )
                if (segmentFromAllRows) {
                  toggleSegmentSelection(segmentFromAllRows)
                }
              },
            })}
          />
        </Card>
      )}

      <Modal
        open={Boolean(selectedCorridorAnalysis)}
        title={
          selectedCorridorAnalysis
            ? `Phân tích nguyên nhân - ${selectedCorridorAnalysis.corridorName}`
            : 'Phân tích nguyên nhân'
        }
        onCancel={() => setSelectedCorridorAnalysis(null)}
        footer={null}
        destroyOnClose
      >
        {selectedCorridorAnalysis && rootCauseChartData ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ height: 260 }}>
              <Doughnut
                data={rootCauseChartData}
                options={{
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom' as const },
                  },
                }}
              />
            </div>
            <Title level={5} style={{ marginBottom: 0 }}>
              Thời gian di chuyển trung bình của corridor là{' '}
              {formatTravelTime(selectedCorridorAnalysis.tAvgSeconds)}; so với
              điều kiện thông thoáng ({' '}
              {formatTravelTime(selectedCorridorAnalysis.tFreeflowSeconds)}),
              người dân nên dự phòng thêm khoảng{' '}
              {formatTravelTime(
                Math.max(
                  0,
                  selectedCorridorAnalysis.tAvgSeconds -
                    selectedCorridorAnalysis.tFreeflowSeconds
                )
              )}
              .
            </Title>
          </Space>
        ) : (
          <EmptyState message="Chưa có dữ liệu nguyên nhân cho corridor này" />
        )}
      </Modal>
    </Space>
  )
}
