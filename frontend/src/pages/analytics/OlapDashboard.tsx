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
import { Button, Card, Select, Typography } from 'antd'
import React, { useState } from 'react'
import './OlapDashboard.css'

const { Text, Title } = Typography

const DISTRICTS = [
  'Quận 1',
  'Quận 3',
  'Quận 4',
  'Quận 5',
  'Quận 6',
  'Quận 7',
  'Quận 8',
  'Quận 10',
  'Quận 11',
  'Quận 12',
  'Quận Bình Thạnh',
  'Quận Gò Vấp',
  'Quận Phú Nhuận',
  'Quận Tân Bình',
  'Quận Tân Phú',
  'Quận Bình Tân',
  'TP Thủ Đức',
  'Huyện Củ Chi',
  'Huyện Hóc Môn',
  'Huyện Bình Chánh',
  'Huyện Nhà Bè',
  'Huyện Cần Giờ',
]

export const OlapDashboard: React.FC = () => {
  const [bubbleMetric, setBubbleMetric] = useState<'pcu' | 'delay'>('pcu')
  const [activeRoadName, setActiveRoadName] = useState<string | null>(null)
  const [district, setDistrict] = useState<string | undefined>('Quận 1')

  const heatmapQuery = useQuery({
    queryKey: ['olap-heatmap-v2', district],
    queryFn: async (): Promise<OlapHeatmapCell[]> => {
      const response = await olapApi.getHeatmap({ district })
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const crossAnalysisQuery = useQuery({
    queryKey: ['olap-cross-analysis-v2', district],
    queryFn: async (): Promise<OlapCrossAnalysisPoint[]> => {
      const response = await olapApi.getCrossAnalysis({ district })
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const drilldownQuery = useQuery({
    queryKey: ['olap-drilldown-v2', activeRoadName, district],
    queryFn: async (): Promise<{
      level: OlapDrillLevel
      points: OlapDrilldownPoint[]
    }> => {
      const response = await olapApi.getDrilldown(
        activeRoadName
          ? { roadName: activeRoadName, district }
          : { district }
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
    setDistrict('Quận 1')
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

          <div className="olap-toolbar-actions">
            <div className="olap-filter-item">
              <Text strong style={{ marginRight: 8 }}>
                Khu vực:
              </Text>
              <Select
                placeholder="Chọn quận/huyện"
                style={{ width: 180 }}
                value={district}
                onChange={setDistrict}
                allowClear
                options={[
                  { label: 'Tất cả khu vực', value: undefined },
                  ...DISTRICTS.map((d) => ({ label: d, value: d })),
                ]}
              />
            </div>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Đặt lại biểu đồ
            </Button>
          </div>
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
