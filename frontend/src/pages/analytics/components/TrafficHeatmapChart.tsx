import { EmptyState } from '@/components/common'
import { OlapHeatmapCell } from '@/types'
import { Alert, Card, Tag } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

type HeatmapTooltipParam = {
  value: [number, number, number]
}

interface TrafficHeatmapChartProps {
  data: OlapHeatmapCell[]
}

export const TrafficHeatmapChart: React.FC<TrafficHeatmapChartProps> = ({
  data,
}) => {
  const option = useMemo<EChartsOption>(() => {
    const roads = Array.from(new Set(data.map((item) => item[1]))).sort(
      (a, b) => a.localeCompare(b)
    )
    const roadIndexMap = new Map<string, number>()
    roads.forEach((road, idx) => roadIndexMap.set(road, idx))

    const seriesData = data.map(([hour, roadName, avgTrafficIndex]) => [
      hour,
      roadIndexMap.get(roadName) ?? 0,
      avgTrafficIndex,
    ])

    const values = data.map((item) => Number(item[2]))
    const minValue = values.length > 0 ? Math.min(...values) : 0
    const maxValue = values.length > 0 ? Math.max(...values) : 1
    const safeMaxValue = maxValue <= minValue ? minValue + 1 : maxValue

    return {
      tooltip: {
        position: 'top',
        formatter: (params: unknown) => {
          const typed = params as HeatmapTooltipParam
          const [hour, roadIndex, value] = typed.value
          const roadName = roads[roadIndex] ?? 'N/A'
          return `${roadName}<br/>${hour}h: <b>${Number(value).toFixed(2)}</b>`
        },
      },
      grid: {
        left: 170,
        right: 48,
        top: 24,
        bottom: 96,
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => `${i}h`),
        splitArea: { show: true },
        axisLabel: {
          interval: 1,
        },
      },
      yAxis: {
        type: 'category',
        data: roads,
        splitArea: { show: true },
        axisLabel: {
          interval: 0,
          width: 140,
          overflow: 'truncate',
        },
      },
      dataZoom: [
        {
          type: 'inside',
          yAxisIndex: 0,
          start: 0,
          end: Math.min(100, (12 / Math.max(roads.length, 1)) * 100),
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
        },
        {
          type: 'slider',
          yAxisIndex: 0,
          right: 10,
          width: 14,
          start: 0,
          end: Math.min(100, (12 / Math.max(roads.length, 1)) * 100),
        },
      ],
      visualMap: {
        min: Number.isFinite(minValue) ? minValue : 0,
        max: Number.isFinite(safeMaxValue) ? safeMaxValue : 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 8,
        precision: 2,
        formatter: '{value}',
        inRange: {
          color: ['#16a34a', '#facc15', '#f97316', '#dc2626'],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: seriesData,
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: 'rgba(0, 0, 0, 0.35)',
            },
          },
        },
      ],
    }
  }, [data])

  return (
    <Card
      title="Traffic Heatmap"
      className="olap-card"
      extra={<Tag color="processing">Heatmap</Tag>}
    >
      {data.length === 0 ? (
        <EmptyState message="Chưa có dữ liệu heatmap" />
      ) : (
        <>
          <ReactECharts
            option={option}
            style={{ height: 420 }}
            notMerge
            lazyUpdate
          />
          <Alert
            showIcon
            className="olap-chart-note"
            type="info"
            message="Gợi ý đọc biểu đồ"
            description="Mỗi hàng là một tuyến đường, mỗi cột là một khung giờ. Màu càng nóng (vàng/đỏ) nghĩa là mức độ kẹt xe trung bình càng cao ở tuyến đường đó theo từng giờ."
          />
        </>
      )}
    </Card>
  )
}
