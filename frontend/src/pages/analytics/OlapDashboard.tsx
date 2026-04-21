import { ErrorState, Loading } from '@/components/common'
import { CrossAnalysisBubbleChart } from '@/pages/analytics/components/CrossAnalysisBubbleChart'
import { DrilldownDelayChart } from '@/pages/analytics/components/DrilldownDelayChart'
import { TrafficHeatmapChart } from '@/pages/analytics/components/TrafficHeatmapChart'
import { olapApi } from '@/services/api'
import {
  OlapCrossAnalysisPoint,
  OlapDrillLevel,
  OlapDrilldownPoint,
  OlapHeatmapCell,
} from '@/types'
import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Typography } from 'antd'
import React, { useState } from 'react'
import './OlapDashboard.css'

const { Text, Title } = Typography

export const OlapDashboard: React.FC = () => {
  const [bubbleMetric, setBubbleMetric] = useState<'pcu' | 'delay'>('pcu')
  const [activeRoadName, setActiveRoadName] = useState<string | null>(null)

  const heatmapQuery = useQuery({
    queryKey: ['olap-heatmap-v2'],
    queryFn: async (): Promise<OlapHeatmapCell[]> => {
      const response = await olapApi.getHeatmap()
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const crossAnalysisQuery = useQuery({
    queryKey: ['olap-cross-analysis-v2'],
    queryFn: async (): Promise<OlapCrossAnalysisPoint[]> => {
      const response = await olapApi.getCrossAnalysis()
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const drilldownQuery = useQuery({
    queryKey: ['olap-drilldown-v2', activeRoadName],
    queryFn: async (): Promise<{
      level: OlapDrillLevel
      points: OlapDrilldownPoint[]
    }> => {
      const response = await olapApi.getDrilldown(
        activeRoadName ? { roadName: activeRoadName } : undefined
      )
      return (
        response.data ?? {
          level: activeRoadName ? 'segment' : 'road',
          points: [],
        }
      )
    },
    placeholderData: (previousData) => previousData,
    staleTime: 10_000,
  })

  const isLoading =
    heatmapQuery.isLoading ||
    crossAnalysisQuery.isLoading ||
    drilldownQuery.isLoading

  const drilldownTransitionLoading =
    drilldownQuery.isFetching && !drilldownQuery.isLoading

  const isError =
    heatmapQuery.isError || crossAnalysisQuery.isError || drilldownQuery.isError

  const handleReset = () => {
    setBubbleMetric('pcu')
    setActiveRoadName(null)
  }

  if (isLoading) {
    return <Loading />
  }

  if (isError) {
    return (
      <ErrorState message="Không thể tải dữ liệu BI & OLAP. Vui lòng thử lại hoặc kiểm tra API backend." />
    )
  }

  return (
    <div className="olap-dashboard">
      <Card className="olap-card" bodyStyle={{ padding: 16 }}>
        <div className="olap-toolbar-header">
          <div className="olap-toolbar-title-block">
            <Title level={5} style={{ marginBottom: 4 }}>
              Tổng quan BI & OLAP
            </Title>
            <Text type="secondary">
              Dữ liệu được tổng hợp từ Materialized View và làm mới mỗi 15 phút.
              Không sử dụng dữ liệu thời tiết.
            </Text>
          </div>

          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Đặt lại biểu đồ
          </Button>
        </div>
      </Card>

      <div className="olap-chart-grid">
        <TrafficHeatmapChart data={heatmapQuery.data ?? []} />
        <CrossAnalysisBubbleChart
          data={crossAnalysisQuery.data ?? []}
          bubbleMetric={bubbleMetric}
          onBubbleMetricChange={setBubbleMetric}
        />
      </div>

      <DrilldownDelayChart
        level={drilldownQuery.data?.level ?? 'road'}
        activeRoadName={activeRoadName}
        data={drilldownQuery.data?.points ?? []}
        loading={drilldownTransitionLoading}
        onSelectRoad={setActiveRoadName}
        onBackToRoad={() => setActiveRoadName(null)}
      />
    </div>
  )
}
