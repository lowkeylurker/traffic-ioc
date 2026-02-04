// Analytics & Statistics Page

import { useMemo } from 'react'
import { Card, Row, Col, Table, Select, DatePicker, Space } from 'antd'
import { LineChart, DoughnutChart } from '@/components/charts/ChartComponents'
import { TrafficMap } from '@/components/map/TrafficMap'
import { Loading, ErrorState } from '@/components/common'
import { useSegments, useTrafficStatus, useAnalytics } from '@/hooks/useTraffic'

export const AnalyticsPage: React.FC = () => {
  const segments = useSegments()
  const trafficStatus = useTrafficStatus()
  const { vehicleMix, speedComparison, reliabilityRanking, loading, error } =
    useAnalytics()

  // Chart Data - Vehicle Mix (A9)
  const vehicleMixChartData = useMemo(
    () => ({
      labels: vehicleMix.map((item) => item.category),
      datasets: [
        {
          label: 'Số lượng xe',
          data: vehicleMix.map((item) => item.percentage),
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    }),
    [vehicleMix]
  )

  // Chart Data - Speed Comparison (A3)
  const speedComparisonChartData = useMemo(
    () => ({
      labels: speedComparison.slice(0, 10).map((item) => item.segmentName),
      datasets: [
        {
          label: 'Tốc độ hiện tại',
          data: speedComparison.slice(0, 10).map((item) => item.currentSpeed),
          borderColor: '#f5222d',
          backgroundColor: 'rgba(245, 34, 45, 0.1)',
          tension: 0.3,
        },
        {
          label: 'Tốc độ baseline',
          data: speedComparison.slice(0, 10).map((item) => item.baselineSpeed),
          borderColor: '#52c41a',
          backgroundColor: 'rgba(82, 196, 26, 0.1)',
          tension: 0.3,
        },
      ],
    }),
    [speedComparison]
  )

  // Table Data - Reliability Ranking (A4)
  const tableColumns = [
    {
      title: 'Đoạn đường',
      dataIndex: 'segmentName',
      key: 'segmentName',
    },
    {
      title: 'Tốc độ hiện tại (km/h)',
      dataIndex: 'currentSpeed',
      key: 'currentSpeed',
      render: (text: number) => text.toFixed(1),
    },
    {
      title: 'Buffer Index (%)',
      dataIndex: 'bufferIndex',
      key: 'bufferIndex',
      render: (text: number) => text.toFixed(1),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sorter: (a: any, b: any) => b.bufferIndex - a.bufferIndex,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'bufferIndex',
      key: 'status',
      render: (value: number) => {
        let status = 'Tốt'
        let color = '#52c41a'
        if (value < 20) {
          status = 'Rất tệ'
          color = '#f5222d'
        } else if (value < 40) {
          status = 'Tệ'
          color = '#ff7a45'
        } else if (value < 60) {
          status = 'Trung bình'
          color = '#faad14'
        }
        return <span style={{ color }}>{status}</span>
      },
    },
  ]

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '80vh',
        }}
      >
        <Loading />
      </div>
    )
  }

  if (error && vehicleMix.length === 0) {
    return <ErrorState message={error} />
  }

  return (
    <div>
      {/* Filter Bar */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Select placeholder="Chọn quận" style={{ width: 150 }} />
          <Select placeholder="Chọn tên đường" style={{ width: 200 }} />
          <DatePicker.RangePicker placeholder={['Từ ngày', 'Đến ngày']} />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        {/* A3 Chart - Speed Comparison */}
        <Col xs={24} md={12}>
          <Card title="So sánh tốc độ (A3)" loading={loading}>
            <div style={{ height: 300 }}>
              <LineChart
                data={speedComparisonChartData}
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
        </Col>

        {/* A9 Chart - Vehicle Mix */}
        <Col xs={24} md={12}>
          <Card title="Tỷ lệ phương tiện (A9)" loading={loading}>
            <div style={{ height: 300 }}>
              <DoughnutChart
                data={vehicleMixChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right' as const,
                    },
                  },
                }}
              />
            </div>
          </Card>
        </Col>

        {/* A4 Table - Reliability Ranking */}
        <Col xs={24}>
          <Card title="Bảng xếp hạng độ đáng tin cậy (A4)" loading={loading}>
            <Table
              dataSource={reliabilityRanking}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              columns={tableColumns as any}
              rowKey="segmentId"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 800 }}
            />
          </Card>
        </Col>

        {/* A5 Map - Heatmap */}
        <Col xs={24}>
          <Card title="Bản đồ nhiệt độ (A5)" loading={loading}>
            <div style={{ height: 400 }}>
              <TrafficMap segments={segments} trafficStatus={trafficStatus} />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
