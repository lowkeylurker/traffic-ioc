import { EmptyState, ErrorState, Loading } from '@/components/common'
import { analyticsApi } from '@/services/api'
import {
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
import { useEffect, useMemo, useState } from 'react'
import Map, { Layer, LayerProps, NavigationControl, Source } from 'react-map-gl'
import { Doughnut } from 'react-chartjs-2'
import 'mapbox-gl/dist/mapbox-gl.css'

const { Text, Title } = Typography

type ReliabilityCauseMap = Record<string, number>

interface CorridorReliabilityItem extends CorridorReliabilityData {
  geometry: GeoJSON.LineString
}

const CORRIDOR_GEOMETRY_POOL: GeoJSON.LineString[] = [
  {
    type: 'LineString',
    coordinates: [
      [106.6602, 10.755],
      [106.6732, 10.758],
      [106.692, 10.7602],
      [106.7095, 10.763],
    ],
  },
  {
    type: 'LineString',
    coordinates: [
      [106.6305, 10.804],
      [106.646, 10.802],
      [106.6615, 10.799],
    ],
  },
  {
    type: 'LineString',
    coordinates: [
      [106.741, 10.804],
      [106.762, 10.815],
      [106.787, 10.835],
    ],
  },
  {
    type: 'LineString',
    coordinates: [
      [106.681, 10.727],
      [106.702, 10.723],
      [106.724, 10.719],
    ],
  },
  {
    type: 'LineString',
    coordinates: [
      [106.649, 10.801],
      [106.663, 10.803],
      [106.676, 10.805],
    ],
  },
]

const toColorByBufferIndex = (bufferIndex: number) => {
  if (bufferIndex < 0.2) {
    return '#52c41a'
  }

  if (bufferIndex <= 0.4) {
    return '#faad14'
  }

  return '#cf1322'
}

const toGeometryFromCorridorKey = (corridorKey: string): GeoJSON.LineString => {
  const numeric = Number(corridorKey)
  if (Number.isFinite(numeric) && numeric > 0) {
    return CORRIDOR_GEOMETRY_POOL[
      Math.floor(numeric) % CORRIDOR_GEOMETRY_POOL.length
    ]
  }

  const hash = corridorKey
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)

  return CORRIDOR_GEOMETRY_POOL[hash % CORRIDOR_GEOMETRY_POOL.length]
}

const fetchReliabilityCorridors = async (
  timeWindow: ReliabilityTimeWindow,
  sortBy: ReliabilitySortBy,
  limit: number,
  signal?: AbortSignal
): Promise<CorridorReliabilityItem[]> => {
  const response = await analyticsApi.getCorridorReliability(
    {
      timeWindow,
      sortBy,
      limit,
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
    geometry: item.geometry ?? toGeometryFromCorridorKey(item.corridorKey),
  }))
}

export const CorridorReliabilityTab: React.FC = () => {
  const [timeWindow, setTimeWindow] = useState<ReliabilityTimeWindow>('AM_PEAK')
  const [sortBy, setSortBy] = useState<ReliabilitySortBy>('buffer_index')
  const [limit, setLimit] = useState<number>(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<CorridorReliabilityItem[]>([])
  const [selectedCorridor, setSelectedCorridor] =
    useState<CorridorReliabilityItem | null>(null)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapStyle =
    import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12'

  useEffect(() => {
    const controller = new AbortController()

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchReliabilityCorridors(
          timeWindow,
          sortBy,
          limit,
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
  }, [limit, sortBy, timeWindow])

  const mapGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: rows.map((item) => ({
        type: 'Feature',
        geometry: item.geometry,
        properties: {
          corridorId: item.corridorKey,
          corridorName: item.corridorName,
          bufferIndex: item.bufferIndex,
          lineColor: toColorByBufferIndex(item.bufferIndex ?? 0),
          isSelected:
            selectedCorridor?.corridorKey === item.corridorKey ? 1 : 0,
        },
      })),
    }),
    [rows, selectedCorridor]
  )

  const lineLayer = useMemo(
    () =>
      ({
        id: 'reliability-corridor-layer',
        type: 'line',
        paint: {
          'line-color': ['coalesce', ['get', 'lineColor'], '#52c41a'],
          'line-width': ['case', ['==', ['get', 'isSelected'], 1], 8, 5],
          'line-opacity': 0.9,
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
      }) as LayerProps,
    []
  )

  const rootCauseChartData = useMemo(() => {
    if (!selectedCorridor) {
      return null
    }

    const labels = Object.keys(selectedCorridor.rootCauses)
    const values = Object.values(selectedCorridor.rootCauses)

    if (labels.length === 0) {
      return null
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
  }, [selectedCorridor])

  const tableColumns = [
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
      title: 'Action',
      key: 'action',
      render: (_: unknown, row: CorridorReliabilityItem) => (
        <Button
          icon={<SearchOutlined />}
          type="text"
          onClick={() => setSelectedCorridor(row)}
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
            style={{ minWidth: 220 }}
            value={sortBy}
            onChange={(value: ReliabilitySortBy) => setSortBy(value)}
            options={[
              { label: 'Sắp theo Buffer Index', value: 'buffer_index' },
              { label: 'Sắp theo PTI', value: 'pti' },
            ]}
          />
          <Select
            style={{ minWidth: 160 }}
            value={limit}
            onChange={(value) => setLimit(value)}
            options={[
              { label: 'Top 5', value: 5 },
              { label: 'Top 10', value: 10 },
              { label: 'Top 15', value: 15 },
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
                  <span>Bảng xếp hạng corridor reliability</span>
                </Space>
              }
            >
              <Table<CorridorReliabilityItem>
                rowKey="corridorKey"
                columns={tableColumns}
                dataSource={rows}
                pagination={false}
                size="small"
                onRow={(record) => ({
                  onClick: () => setSelectedCorridor(record),
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

      <Modal
        open={Boolean(selectedCorridor)}
        title={
          selectedCorridor
            ? `Phân tích nguyên nhân - ${selectedCorridor.corridorName}`
            : 'Phân tích nguyên nhân'
        }
        onCancel={() => setSelectedCorridor(null)}
        footer={null}
        destroyOnClose
      >
        {selectedCorridor && rootCauseChartData ? (
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
              Người dân đi qua đây phải dự phòng thêm{' '}
              {((selectedCorridor.bufferIndex ?? 0) * 100).toFixed(0)}% thời
              gian so với bình thường.
            </Title>
          </Space>
        ) : (
          <EmptyState message="Chưa có dữ liệu nguyên nhân cho corridor này" />
        )}
      </Modal>
    </Space>
  )
}
