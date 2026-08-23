import { EmptyState } from '@/components/common'
import { OlapDistrictRankingItem } from '@/types'
import { Card, Spin, Tag, Typography } from 'antd'
import type { EChartsOption } from 'echarts'
import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

const { Text } = Typography

interface DistrictRankingChartProps {
  data: OlapDistrictRankingItem[]
  loading?: boolean
}

export const DistrictRankingChart: React.FC<DistrictRankingChartProps> = ({
  data,
  loading = false,
}) => {
  const option = useMemo<EChartsOption>(() => {
    // Sort by traffic index descending
    const sortedData = [...data].sort((a, b) => b.avgTrafficIndex - a.avgTrafficIndex)
    
    const districts = sortedData.map((item) => item.district)
    const trafficIndices = sortedData.map((item) => item.avgTrafficIndex)
    const vcRatios = sortedData.map((item) => item.avgVcRatio)

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
        bottom: '12%',
        top: '5%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        boundaryGap: [0, 0.01],
      },
      yAxis: {
        type: 'category',
        data: districts,
        axisLabel: {
          interval: 0,
          width: 100,
          overflow: 'truncate',
        },
      },
      series: [
        {
          name: 'Traffic Index',
          type: 'bar',
          data: trafficIndices,
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'V/C Ratio',
          type: 'bar',
          data: vcRatios,
          itemStyle: { color: '#10b981' },
        },
      ],
    }
  }, [data])

  return (
    <Card
      title="Xếp hạng Hiệu năng theo Quận (Benchmarking)"
      className="olap-card"
      extra={<Tag color="purple">Districts</Tag>}
    >
      {data.length === 0 && !loading ? (
        <EmptyState message="Chưa có dữ liệu xếp hạng quận" />
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
              <Spin size="large" tip="Đang tải xếp hạng quận..." />
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" italic style={{ fontSize: 12 }}>
              * Biểu đồ so sánh mức độ ùn tắc trung bình và hiệu suất sử dụng hạ tầng giữa các quận/huyện để xác định khu vực cần ưu tiên nguồn lực.
            </Text>
          </div>
        </div>
      )}
    </Card>
  )
}
