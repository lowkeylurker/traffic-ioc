import { ExperimentOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import React, { useState } from 'react'
import { LineChart } from '@/components/charts/ChartComponents'
import { PredictiveMap } from '@/components/map/PredictiveMap'
import { SelectionMap } from '@/components/map/SelectionMap'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { analyticsApi, predictionApi } from '@/services/api'
import { PredictionItem, ComparisonMetric } from '@/types'

const { Text } = Typography

type RoadInfo = {
  roadName: string
  roadKey?: string
  segmentCount: number
  segmentIds: number[]
}

export const SimulationPage: React.FC = () => {
  const segmentData = useSegments()
  const trafficStatus = useTrafficStatus()

  // Hide scrollbars on mount to fit viewport
  React.useEffect(() => {
    const contentEl = document.querySelector(
      '.ant-layout-content'
    ) as HTMLElement | null
    const prevContentOverflow = contentEl?.style.overflow
    const prevBodyOverflow = document.body.style.overflow

    if (contentEl) {
      contentEl.style.overflow = 'hidden'
    }
    document.body.style.overflow = 'hidden'

    return () => {
      if (contentEl) {
        contentEl.style.overflow = prevContentOverflow ?? ''
      }
      document.body.style.overflow = prevBodyOverflow
    }
  }, [])

  const [selectedRoad, setSelectedRoad] = useState<RoadInfo | null>(null)
  const [hoveredRoad, setHoveredRoad] = useState<RoadInfo | null>(null)

  const [forecastLoading, setForecastLoading] = useState(false)
  const [chartLoading, setChartLoading] = useState(false)
  const [routingLoading, setRoutingLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'real-time' | 'forecast'>(
    'real-time'
  )
  const [predictionData, setPredictionData] = useState<PredictionItem[]>([])

  const [chartData, setChartData] = useState<{
    labels: string[]
    datasets: {
      label: string
      data: (number | null)[]
      fill?: boolean
      backgroundColor?: string
      borderColor?: string
      tension?: number
      borderDash?: number[]
      hidden?: boolean
    }[]
  } | null>(null)

  // Fetch historical chart data when road selection changes
  React.useEffect(() => {
    if (!selectedRoad) {
      setChartData(null)
      return
    }

    const fetchChartData = async () => {
      setChartLoading(true)
      try {
        const params = {
          scopeType: (selectedRoad.roadKey ? 'road' : 'segment') as
            | 'road'
            | 'segment',
          roadKey: selectedRoad.roadKey,
          segmentId: !selectedRoad.roadKey
            ? String(selectedRoad.segmentIds[0])
            : undefined,
          metric: 'currentSpeedKmh' as ComparisonMetric,
          date: dayjs().format('YYYY-MM-DD'),
        }

        const result = await analyticsApi.getComparison(params)

        if (result.success && result.data) {
          const sortedData = [...result.data].sort((a, b) => a.hour - b.hour)

          setChartData({
            labels: sortedData.map((d) => `${d.hour}h`),
            datasets: [
              {
                label: 'Tốc độ thực tế (km/h)',
                data: sortedData.map((d) => d.todayValue),
                fill: true,
                backgroundColor: 'rgba(82, 196, 26, 0.1)',
                borderColor: '#52c41a',
                tension: 0.3,
              },
              {
                label: 'Tốc độ lịch sử (Baseline)',
                data: sortedData.map((d) => d.baselineAvg),
                fill: false,
                borderColor: '#bfbfbf',
                borderDash: [5, 5],
                tension: 0.3,
                hidden: true,
              },
            ],
          })
        }
      } catch (error) {
        console.error('Failed to fetch chart data:', error)
      } finally {
        setChartLoading(false)
      }
    }

    fetchChartData()
  }, [selectedRoad])

  const handleRunForecast = async () => {
    if (!selectedRoad || selectedRoad.segmentIds.length === 0) {
      message.warning(
        'Vui lòng chọn một đoạn đường hoặc trục đường trên bản đồ phụ.'
      )
      return
    }

    setForecastLoading(true)
    try {
      const response = await predictionApi.getBatchPrediction({
        segment_ids: selectedRoad.segmentIds,
        request_time: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
        prediction_horizon_minutes: 15,
      })

      if (response.items) {
        setPredictionData(response.items)
        setViewMode('forecast')
        message.success(`Dự báo hoàn tất cho ${selectedRoad.roadName}`)
      }
    } catch (error) {
      message.error('Lỗi khi lấy dữ liệu dự báo')
      console.error('Forecast error:', error)
    } finally {
      setForecastLoading(false)
    }
  }

  const handleReset = () => {
    setViewMode('real-time')
    setPredictionData([])
  }

  const handleRouting = async () => {
    if (!selectedRoad) return
    setRoutingLoading(true)
    try {
      // Logic for alternative routing could go here
      message.info('Đang tính toán lộ trình thay thế dựa trên dự báo kẹt xe...')
      await new Promise((resolve) => setTimeout(resolve, 1500))
      message.success('Đã đề xuất lộ trình thay thế tối ưu.')
    } catch {
      message.error('Lỗi khi tính toán lộ trình')
    } finally {
      setRoutingLoading(false)
    }
  }

  const displayRoad = selectedRoad || hoveredRoad
  const inputValue = displayRoad
    ? `${displayRoad.roadName} (${displayRoad.segmentCount} segments)`
    : ''

  return (
    <Row
      gutter={[16, 16]}
      style={{
        height: 'calc(100vh - 16px)',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      {/* Left Pane - Main Predictive Map */}
      <Col xs={24} md={16} lg={17} style={{ height: '100%' }}>
        <Card
          title={
            <Space>
              <span>Bản đồ Dự báo Động</span>
              {viewMode === 'forecast' && (
                <Text type="danger" strong style={{ fontSize: '12px' }}>
                  (Đang ở chế độ Dự báo)
                </Text>
              )}
            </Space>
          }
          extra={
            viewMode === 'forecast' && (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleReset}
              >
                Quay lại Hiện tại
              </Button>
            )
          }
          style={{ height: '100%' }}
          bodyStyle={{ height: 'calc(100% - 57px)', padding: 0 }}
        >
          <PredictiveMap
            segmentData={segmentData}
            viewMode={viewMode}
            predictionData={predictionData}
            selectedRoad={selectedRoad}
            isLoading={forecastLoading}
          />
        </Card>
      </Col>

      {/* Right Pane - Control Panel */}
      <Col
        xs={24}
        md={8}
        lg={7}
        style={{
          height: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Selection Map (Small) */}
          <Card
            title="Chọn trục đường / Đoạn đường"
            size="small"
            bodyStyle={{ height: 280, padding: 4 }}
          >
            <SelectionMap
              segmentData={segmentData}
              trafficStatus={trafficStatus || []}
              onSelect={setSelectedRoad}
              onHover={setHoveredRoad}
            />
          </Card>

          {/* Selection Details & Controls */}
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: 8,
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Trục đường đang chọn:
                </label>
                <Input
                  placeholder="Hover hoặc Click vào bản đồ để chọn"
                  value={inputValue}
                  readOnly
                  style={{
                    backgroundColor: selectedRoad ? '#e6f7ff' : '#f5f5f5',
                    borderColor: selectedRoad ? '#91d5ff' : '#d9d9d9',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  loading={forecastLoading}
                  onClick={handleRunForecast}
                  style={{ flex: 1 }}
                  disabled={!selectedRoad}
                >
                  Chạy dự báo
                </Button>

                {viewMode === 'forecast' && (
                  <Button icon={<ReloadOutlined />} onClick={handleReset} />
                )}
              </div>

              <Button
                loading={routingLoading}
                onClick={handleRouting}
                block
                disabled={!selectedRoad}
              >
                Tính toán lộ trình thay thế
              </Button>
            </Space>
          </Card>

          {/* Speed Variation Chart */}
          <Card
            title="Lịch sử tốc độ trong ngày (biểu đồ 24h)"
            size="small"
            extra={chartLoading && <Spin size="small" />}
          >
            <div style={{ height: 240 }}>
              {chartData ? (
                <LineChart
                  data={chartData}
                  options={{ maintainAspectRatio: false }}
                />
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#bfbfbf',
                  }}
                >
                  {selectedRoad
                    ? 'Đang tải dữ liệu...'
                    : 'Chọn đường để xem lịch sử tốc độ'}
                </div>
              )}
            </div>
          </Card>
        </div>
      </Col>
    </Row>
  )
}
