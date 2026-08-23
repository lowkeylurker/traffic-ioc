import { EmptyState } from '@/components/common'
import { OlapRoadTypeEfficiencyItem } from '@/types'
import { Card, Spin, Tag, Typography } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

const { Text } = Typography

interface RoadTypeEfficiencyChartProps {
  data: OlapRoadTypeEfficiencyItem[]
  loading?: boolean
}

const roadTypeLabels: Record<string, string> = {
  trunk: 'Trunk (Trục chính)',
  primary: 'Primary (Huyết mạch)',
  secondary: 'Secondary (Liên quận)',
}

export const RoadTypeEfficiencyChart: React.FC<RoadTypeEfficiencyChartProps> = ({
  data,
  loading = false,
}) => {
  const option = useMemo<EChartsOption>(() => {
    const types = data.map((item) => roadTypeLabels[item.type] || item.type)
    const trafficIndices = data.map((item) => item.avgTrafficIndex)
    const vcRatios = data.map((item) => item.avgVcRatio)

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: ['Traffic Index', 'V/C Ratio'],
        bottom: 0,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: types,
      },
      yAxis: {
        type: 'value',
      },
      series: [
        {
          name: 'Traffic Index',
          type: 'bar',
          barWidth: '30%',
          data: trafficIndices,
          itemStyle: { color: '#f59e0b' },
        },
        {
          name: 'V/C Ratio',
          type: 'bar',
          barWidth: '30%',
          data: vcRatios,
          itemStyle: { color: '#ef4444' },
        },
      ],
    }
  }, [data])

  return (
    <Card
      title="Hiệu năng theo Cấp hạng Đường"
      className="olap-card"
      extra={<Tag color="orange">Road Class</Tag>}
    >
      {data.length === 0 && !loading ? (
        <EmptyState message="Chưa có dữ liệu hiệu năng loại đường" />
      ) : (
        <div style={{ position: 'relative' }}>
          <ReactECharts
            option={option}
            style={{ height: 400 }}
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
                background: 'rgba(255, 255, 255, 0.6)',
                zIndex: 2,
              }}
            >
              <Spin size="large" tip="Đang tải dữ liệu loại đường..." />
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" italic style={{ fontSize: 12 }}>
              * Phân tích xem các trục huyết mạch (Trunk) có đang được khai thác hiệu quả hơn các tuyến liên quận (Secondary) hay không.
            </Text>
          </div>
        </div>
      )}
    </Card>
  )
}
