import { EmptyState } from '@/components/common'
import { OlapDrillLevel, OlapDrilldownPoint } from '@/types'
import { RollbackOutlined } from '@ant-design/icons'
import { Button, Card, Space, Spin, Tag } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

type DrillClickParam = {
  name?: string
}

interface DrilldownDelayChartProps {
  level: OlapDrillLevel
  activeRoadName: string | null
  data: OlapDrilldownPoint[]
  loading?: boolean
  onSelectRoad: (roadName: string) => void
  onBackToRoad: () => void
}

export const DrilldownDelayChart: React.FC<DrilldownDelayChartProps> = ({
  level,
  activeRoadName,
  data,
  loading = false,
  onSelectRoad,
  onBackToRoad,
}) => {
  const option = useMemo<EChartsOption>(() => {
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const axisParams = Array.isArray(params)
            ? (params as Array<{ dataIndex: number }>)
            : []
          const first = axisParams[0]
          if (!first) return ''
          const point = data[first.dataIndex]
          if (!point) return ''
          return `${point.label}<br/>Độ trễ trung bình: <b>${point.avgDelaySeconds.toFixed(2)}s</b>`
        },
      },
      grid: { left: 56, right: 20, top: 24, bottom: 56 },
      xAxis: {
        type: 'category',
        name: level === 'road' ? 'Đường' : 'Segment',
        axisLabel: {
          interval: 0,
          rotate: 30,
        },
        data: data.map((point) => point.label),
      },
      yAxis: {
        type: 'value',
        name: 'Độ trễ trung bình (s)',
      },
      series: [
        {
          type: 'bar',
          data: data.map((point) => Number(point.avgDelaySeconds.toFixed(2))),
          itemStyle: {
            color: level === 'road' ? '#2563eb' : '#0f766e',
            borderRadius: [6, 6, 0, 0],
          },
        },
      ],
    }
  }, [data, level])

  const handleChartClick = (params: unknown) => {
    if (level !== 'road' || loading) return

    const typed = params as DrillClickParam
    const roadName = String(typed?.name ?? '').trim()
    if (!roadName) return
    onSelectRoad(roadName)
  }

  return (
    <Card
      title={
        level === 'road'
          ? 'Drill-down Bar Chart (Đường -> Segment)'
          : `Drill-down: ${activeRoadName}`
      }
      className="olap-card"
      extra={
        <Space>
          {level === 'segment' && (
            <Button icon={<RollbackOutlined />} onClick={onBackToRoad}>
              Quay lại danh sách Đường
            </Button>
          )}
          <Tag color={level === 'road' ? 'blue' : 'geekblue'}>
            {level === 'road' ? 'Cấp Đường' : 'Cấp Segment'}
          </Tag>
        </Space>
      }
    >
      {data.length === 0 ? (
        <EmptyState message="Chưa có dữ liệu drill-down" />
      ) : (
        <div style={{ position: 'relative' }}>
          <ReactECharts
            option={option}
            style={{ height: 400 }}
            onEvents={{ click: handleChartClick }}
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
              <Spin size="large" tip="Đang tải drill-down..." />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
