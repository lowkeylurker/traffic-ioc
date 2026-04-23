import { HistoryRecord } from '@/types'
import { Card, Empty, Select, Space, Typography } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { memo, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'

type TrendMetric = 'delaySeconds' | 'pcuVolume'

interface HistoryTrendChartProps {
  data: HistoryRecord[]
}

const { Text } = Typography

export const HistoryTrendChart = memo(function HistoryTrendChart({
  data,
}: HistoryTrendChartProps) {
  const [metric, setMetric] = useState<TrendMetric>('delaySeconds')

  const option = useMemo<EChartsOption>(() => {
    const seriesData = data
      .map((item) => {
        const value =
          metric === 'delaySeconds' ? item.delaySeconds : item.pcuVolume
        return {
          value: [item.timestamp, value ?? null],
        }
      })
      .sort(
        (a, b) =>
          new Date(String(a.value[0])).getTime() -
          new Date(String(b.value[0])).getTime()
      )

    const yAxisName =
      metric === 'delaySeconds' ? 'Độ trễ (s)' : 'Lưu lượng (PCU)'

    return {
      animation: true,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          snap: true,
        },
      },
      grid: {
        left: 56,
        right: 20,
        top: 30,
        bottom: 74,
      },
      xAxis: {
        type: 'time',
        name: 'Thời gian',
        nameLocation: 'middle',
        nameGap: 34,
      },
      yAxis: {
        type: 'value',
        name: yAxisName,
        nameLocation: 'middle',
        nameGap: 48,
        scale: true,
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          bottom: 18,
          height: 18,
        },
      ],
      series: [
        {
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: '#1677ff',
          },
          areaStyle: {
            color: 'rgba(22, 119, 255, 0.12)',
          },
          data: seriesData,
        },
      ],
    }
  }, [data, metric])

  return (
    <Card
      size="small"
      title="Xu hướng theo thời gian"
      extra={
        <Space size={8}>
          <Text type="secondary">Đại lượng</Text>
          <Select<TrendMetric>
            size="small"
            value={metric}
            onChange={setMetric}
            style={{ width: 170 }}
            options={[
              { value: 'delaySeconds', label: 'Độ trễ (s)' },
              { value: 'pcuVolume', label: 'Lưu lượng (PCU)' },
            ]}
          />
        </Space>
      }
    >
      {data.length === 0 ? (
        <Empty description="Chưa có dữ liệu để trực quan hóa" />
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 360, width: '100%' }}
          notMerge
          lazyUpdate
        />
      )}
    </Card>
  )
})
