import { EmptyState } from '@/components/common'
import { OlapCrossAnalysisPoint } from '@/types'
import { Alert, Card, Radio, Space, Spin, Tag, Typography } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

const { Text } = Typography

type BubbleMetric = 'pcu' | 'delay'

type ScatterTooltipParam = {
  value: [number, number, number, string, number, number, number]
}

interface CrossAnalysisBubbleChartProps {
  data: OlapCrossAnalysisPoint[]
  bubbleMetric: BubbleMetric
  loading?: boolean
  onBubbleMetricChange: (value: BubbleMetric) => void
}

export const CrossAnalysisBubbleChart: React.FC<
  CrossAnalysisBubbleChartProps
> = ({ data, bubbleMetric, loading = false, onBubbleMetricChange }) => {
  const option = useMemo<EChartsOption>(() => {
    const zValues = data.map((item) =>
      bubbleMetric === 'pcu' ? item.avgPcuVolume : item.avgDelaySeconds
    )
    const minValue = zValues.length > 0 ? Math.min(...zValues) : 0
    const maxValue = zValues.length > 0 ? Math.max(...zValues) : 0

    const normalizeSize = (value: number): number => {
      const MIN_SIZE = 14
      const MAX_SIZE = 76

      if (!Number.isFinite(value)) return MIN_SIZE
      if (maxValue <= minValue) return (MIN_SIZE + MAX_SIZE) / 2

      const ratio = (value - minValue) / (maxValue - minValue)
      return MIN_SIZE + Math.max(0, Math.min(1, ratio)) * (MAX_SIZE - MIN_SIZE)
    }

    const getStressColor = (vcRatio: number): string => {
      if (vcRatio < 0.7) return '#059669'
      if (vcRatio <= 1.0) return '#f59e0b'
      return '#ef4444'
    }

    const getStressFill = (vcRatio: number): string => {
      if (vcRatio < 0.7) return 'rgba(5, 150, 105, 0.55)'
      if (vcRatio <= 1.0) return 'rgba(245, 158, 11, 0.55)'
      return 'rgba(239, 68, 68, 0.58)'
    }

    const seriesData = data.map((item) => {
      const zValue =
        bubbleMetric === 'pcu' ? item.avgPcuVolume : item.avgDelaySeconds
      const vcRatio =
        item.designCapacity > 0 ? item.avgPcuVolume / item.designCapacity : 0
      return {
        value: [
          item.designCapacity,
          item.avgTrafficIndex,
          zValue,
          item.roadName,
          item.avgPcuVolume,
          item.avgDelaySeconds,
          vcRatio,
        ],
        itemStyle: {
          color: getStressFill(vcRatio),
          borderColor: getStressColor(vcRatio),
          borderWidth: 1.4,
        },
      }
    })

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const typed = params as ScatterTooltipParam
          const [
            designCapacity,
            avgTrafficIndex,
            zValue,
            roadName,
            avgPcuVolume,
            avgDelaySeconds,
            vcRatio,
          ] = typed.value
          const stressLabel =
            vcRatio < 0.7
              ? 'Hạ tầng còn dư công suất'
              : vcRatio <= 1.0
                ? 'Hạ tầng tiệm cận giới hạn'
                : 'Hạ tầng bị quá tải cấu trúc'
          return [
            `<b>${roadName}</b>`,
            `Sức chứa thiết kế: ${Number(designCapacity).toFixed(2)}`,
            `Mức độ kẹt xe: ${Number(avgTrafficIndex).toFixed(2)}`,
            `Lưu lượng xe (PCU): ${Number(avgPcuVolume).toFixed(2)}`,
            `Thời gian trễ (s): ${Number(avgDelaySeconds).toFixed(2)}`,
            `V/C Ratio: ${Number(vcRatio).toFixed(2)} - ${stressLabel}`,
            `${bubbleMetric === 'pcu' ? 'Kích thước bóng theo PCU' : 'Kích thước bóng theo Độ trễ'}: ${Number(zValue).toFixed(2)}`,
          ].join('<br/>')
        },
      },
      grid: { left: 100, right: 48, top: 28, bottom: 76, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Sức chứa thiết kế',
        nameLocation: 'middle',
        nameGap: 44,
        axisLabel: {
          margin: 12,
        },
      },
      yAxis: {
        type: 'value',
        name: 'Mức độ kẹt xe (Traffic Index)',
        nameLocation: 'middle',
        nameGap: 62,
        axisLabel: {
          margin: 12,
        },
      },
      series: [
        {
          type: 'scatter',
          data: seriesData,
          symbolSize: (value: unknown) => {
            const raw = Array.isArray(value) ? value : []
            return normalizeSize(Number(raw[2] ?? 0))
          },
          emphasis: {
            itemStyle: {
              borderColor: '#0f172a',
              borderWidth: 1.6,
            },
          },
          encode: { x: 0, y: 1, tooltip: [0, 1, 2, 3, 4, 5, 6] },
        },
      ],
    }
  }, [bubbleMetric, data])

  return (
    <Card
      title="Cross-analysis Bubble Chart (Đánh giá Hạ tầng)"
      className="olap-card"
      extra={<Tag color="cyan">Bubble</Tag>}
    >
      {data.length === 0 && !loading ? (
        <EmptyState message="Chưa có dữ liệu cross-analysis" />
      ) : (
        <div style={{ position: 'relative' }}>
          <div className="olap-filter-panel" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>Chọn đại lượng kích thước bóng (Z-axis):</Text>
              <Radio.Group
                className="olap-control"
                optionType="button"
                buttonStyle="solid"
                value={bubbleMetric}
                onChange={(event) => onBubbleMetricChange(event.target.value)}
                options={[
                  { label: 'Lưu lượng xe (PCU)', value: 'pcu' },
                  { label: 'Thời gian trễ (s)', value: 'delay' },
                ]}
              />
            </Space>
          </div>

          <ReactECharts
            option={option}
            style={{ height: 440, width: '100%' }}
            notMerge
            lazyUpdate
          />

          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.55)',
                zIndex: 2,
              }}
            >
              <Spin size="large" tip="Đang tải bubble chart..." />
            </div>
          )}

          <Alert
            showIcon
            className="olap-chart-note"
            type="info"
            message="Gợi ý đọc biểu đồ"
            description="Biểu đồ này dùng để đánh giá hiệu quả hạ tầng theo từng tuyến. Trục X là sức chứa thiết kế, trục Y là mức độ kẹt xe trung bình, còn màu sắc thể hiện độ stress cấu trúc của tuyến theo V/C Ratio = PCU / Design Capacity: xanh là còn dư công suất, vàng là tiệm cận giới hạn, đỏ là quá tải. Bóng càng lớn nghĩa là tải vận hành càng cao theo chỉ số bạn chọn (PCU hoặc thời gian trễ). Cách đọc này giúp phát hiện các tuyến nhìn qua có Traffic Index còn ổn nhưng thực tế đang bị nhồi xe vượt thiết kế, dễ xuống cấp hoặc chực kẹt khi có một sự cố nhỏ."
          />
        </div>
      )}
    </Card>
  )
}
