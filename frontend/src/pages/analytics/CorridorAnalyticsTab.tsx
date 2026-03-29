import { LineChart } from '@/components/charts/ChartComponents'
import { ErrorState, Loading } from '@/components/common'
import { useCorridorDashboard, useCorridorOptions } from '@/hooks/useTraffic'
import { ApartmentOutlined } from '@ant-design/icons'
import { Card, Col, Row, Select, Space, Statistic, Tag, Typography } from 'antd'
import { Bar } from 'react-chartjs-2'
import { useEffect, useMemo, useState } from 'react'
import dayjs, { Dayjs } from 'dayjs'
import CountUp from 'react-countup'

const { Text } = Typography

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

interface CorridorAnalyticsTabProps {
  selectedDate?: Dayjs
}

export const CorridorAnalyticsTab: React.FC<CorridorAnalyticsTabProps> = ({
  selectedDate = dayjs(),
}) => {
  const [selectedCorridorKey, setSelectedCorridorKey] = useState<
    string | undefined
  >(undefined)

  const { corridors, loading: corridorsLoading } = useCorridorOptions()
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
      if (!grouped.has(cell.corridorKey)) {
        grouped.set(cell.corridorKey, {
          corridorName: cell.corridorName,
          values: new Map<number, number | null>(),
        })
      }
      grouped.get(cell.corridorKey)?.values.set(cell.hour, cell.travelTimeIndex)
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
  const twoDecimalCountFormatter = useMemo(() => createCountUpFormatter(2), [])

  if (corridorsLoading || corridors.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60vh',
        }}
      >
        <Loading />
      </div>
    )
  }

  return (
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
      <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
        Theo dõi hiệu năng hành lang, TTI, bottleneck và cảnh báo vận hành theo
        corridor đã chọn.
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
                value={corridorDashboard.kpis.activeIncidentCount ?? 0}
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
                So sánh tốc độ thực tế với tốc độ mục tiêu để phát hiện khung
                giờ hụt hiệu năng.
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
                Chỉ số TTI theo giờ cho biết mức kéo dài thời gian di chuyển.
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
                Xếp hạng các corridor có tổng delay cao nhất để ưu tiên can
                thiệp.
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
                Bản đồ nhiệt giúp thấy corridor nào quá tải theo từng giờ trong
                ngày.
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
                        <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
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
                              cell === null ? 'N/A' : `TTI: ${cell.toFixed(2)}`
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
                Các segment thường xuyên nghẽn nhất trong corridor đang theo
                dõi.
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
                Cảnh báo vượt ngưỡng vận hành và mức chênh lệch so với baseline
                lịch sử.
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
                  color={corridorDashboard.alerts.isHighTti ? 'red' : 'green'}
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
                    {corridorDashboard.baselineComparison.speedDeltaPct === null
                      ? 'N/A'
                      : `${corridorDashboard.baselineComparison.speedDeltaPct.toFixed(2)}%`}
                  </strong>
                </Text>
                <Text>
                  Delta tổng trễ vs baseline:{' '}
                  <strong>
                    {corridorDashboard.baselineComparison.delayDeltaPct === null
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
  )
}
