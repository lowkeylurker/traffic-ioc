// Simulation & Forecast Page

import { useMemo, useState } from 'react'
import { Card, Row, Col, Button, Input, Space, message } from 'antd'
import { ExperimentOutlined } from '@ant-design/icons'
import { LineChart } from '@/components/charts/ChartComponents'
import { TrafficMap } from '@/components/map/TrafficMap'
import { useSegments, useTrafficStatus } from '@/hooks/useTraffic'
import { simulationApi } from '@/services/api'
import dayjs from 'dayjs'

export const SimulationPage: React.FC = () => {
  const segments = useSegments()
  const trafficStatus = useTrafficStatus()
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    null
  )
  const [forecastLoading, setForecastLoading] = useState(false)
  const [routingLoading, setRoutingLoading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [forecastResult, setForecastResult] = useState<any>(null)
  const [routingResult, setRoutingResult] = useState<string>('')

  // Mock forecast chart data
  const forecastChartData = useMemo(() => {
    const now = dayjs()
    const labels = Array.from({ length: 12 }, (_, i) =>
      now.add(i * 5, 'minute').format('HH:mm')
    )

    return {
      labels,
      datasets: [
        {
          label: 'Dự báo tốc độ',
          data: Array.from(
            { length: 12 },
            () => 30 + Math.random() * 20 // Random speed 30-50 km/h
          ),
          fill: true,
          backgroundColor: 'rgba(24, 144, 255, 0.1)',
          borderColor: '#1890ff',
          tension: 0.3,
        },
      ],
    }
  }, [])

  const handleForecast = async () => {
    if (!selectedSegmentId) {
      message.warning('Vui lòng chọn một đoạn đường')
      return
    }

    setForecastLoading(true)
    try {
      const result = await simulationApi.runForecast(selectedSegmentId, 60)
      if (result.success && result.data) {
        setForecastResult(result.data)
        message.success('Dự báo thành công')
      }
    } catch (error) {
      message.error('Lỗi khi dự báo')
      console.error('Forecast error:', error)
    } finally {
      setForecastLoading(false)
    }
  }

  const handleRouting = async () => {
    setRoutingLoading(true)
    try {
      const result = await simulationApi.runRouting(
        [106.7009, 10.7769], // Start point
        [106.715, 10.81] // End point
      )
      if (result.success && result.data) {
        setRoutingResult(
          `Lộ trình thay thế: ${result.data.totalDistance?.toFixed(1)} km, ~${Math.round(result.data.estimatedTime)} phút`
        )
        message.success('Tính toán lộ trình thành công')
      }
    } catch (error) {
      message.error('Lỗi khi tính toán lộ trình')
      console.error('Routing error:', error)
    } finally {
      setRoutingLoading(false)
    }
  }

  return (
    <Row gutter={[16, 16]} style={{ height: 'calc(100vh - 150px)' }}>
      {/* Left Pane - Map */}
      <Col xs={24} md={16} style={{ height: '100%' }}>
        <Card
          title="Bản đồ Mô phỏng"
          style={{ height: '100%' }}
          bodyStyle={{ height: 'calc(100% - 57px)', padding: 0 }}
        >
          <TrafficMap
            segments={segments}
            trafficStatus={trafficStatus}
            onMapClick={(event) => {
              // In thực tế, cần click vào segment để chọn
              console.log('Map clicked:', event)
            }}
          />
        </Card>
      </Col>

      {/* Right Pane - Control Panel */}
      <Col xs={24} md={8} style={{ height: '100%' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            height: '100%',
          }}
        >
          {/* B1 Chart - Forecast */}
          <Card title="Dự báo 60 phút tới (B1)" loading={forecastLoading}>
            <div style={{ height: 250 }}>
              <LineChart
                data={forecastChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 80,
                    },
                  },
                }}
              />
            </div>
          </Card>

          {/* Control Buttons */}
          <Card>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  Chọn đoạn đường:
                </label>
                <Input
                  type="number"
                  placeholder="Nhập ID đoạn đường"
                  value={selectedSegmentId || ''}
                  onChange={(e) =>
                    setSelectedSegmentId(
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                />
              </div>

              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                loading={forecastLoading}
                onClick={handleForecast}
                block
              >
                Chạy dự báo
              </Button>

              <Button loading={routingLoading} onClick={handleRouting} block>
                Tính toán lộ trình thay thế
              </Button>
            </Space>
          </Card>

          {/* Result Panel */}
          {(forecastResult || routingResult) && (
            <Card title="Kết quả" style={{ flex: 1, overflowY: 'auto' }}>
              {forecastResult && (
                <div style={{ marginBottom: 16 }}>
                  <p>
                    <strong>Tốc độ dự báo:</strong>{' '}
                    {forecastResult.predictedSpeed?.toFixed(1)} km/h
                  </p>
                  <p>
                    <strong>LOS dự báo:</strong> {forecastResult.predictedLos}
                  </p>
                  <p>
                    <strong>Độ tin cậy:</strong>{' '}
                    {forecastResult.confidenceScore?.toFixed(0)}%
                  </p>
                </div>
              )}
              {routingResult && (
                <div>
                  <p>{routingResult}</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </Col>
    </Row>
  )
}
