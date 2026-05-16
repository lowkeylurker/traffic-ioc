import { CrossAnalysisBubbleChart } from '@/pages/analytics/components/CrossAnalysisBubbleChart'
import { DistrictRankingChart } from '@/pages/analytics/components/DistrictRankingChart'
import { DrilldownDelayChart } from '@/pages/analytics/components/DrilldownDelayChart'
import { ExecutiveSummary } from '@/pages/analytics/components/ExecutiveSummary'
import { RoadTypeEfficiencyChart } from '@/pages/analytics/components/RoadTypeEfficiencyChart'
import { TrafficHeatmapChart } from '@/pages/analytics/components/TrafficHeatmapChart'
import { olapApi } from '@/services/api'
import type {
  OlapCrossAnalysisPoint,
  OlapDistrictRankingItem,
  OlapDrillLevel,
  OlapDrilldownPoint,
  OlapHeatmapCell,
  OlapRoadTypeEfficiencyItem,
  OlapSummary,
} from '@/types'
import {
  FileImageOutlined,
  FilePdfOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { exportToImage, exportToPdf } from '@/utils/exportUtils'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Dropdown, Menu, Select, Spin, Tag, Typography } from 'antd'
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
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'all'>('all')
  const [roadTypes, setRoadTypes] = useState<string[]>(['trunk', 'primary', 'secondary'])

  const heatmapQuery = useQuery({
    queryKey: ['olap-heatmap-v2', district, period, roadTypes],
    queryFn: async (): Promise<OlapHeatmapCell[]> => {
      const response = await olapApi.getHeatmap({ district, period, roadTypes })
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const crossAnalysisQuery = useQuery({
    queryKey: ['olap-cross-analysis-v2', district, period, roadTypes],
    queryFn: async (): Promise<OlapCrossAnalysisPoint[]> => {
      const response = await olapApi.getCrossAnalysis({ district, period, roadTypes })
      return response.data ?? []
    },
    staleTime: 30_000,
  })

  const drilldownQuery = useQuery({
    queryKey: ['olap-drilldown-v2', activeRoadName, district, period, roadTypes],
    queryFn: async (): Promise<{
      level: OlapDrillLevel
      points: OlapDrilldownPoint[]
    }> => {
      const response = await olapApi.getDrilldown(
        activeRoadName
          ? { roadName: activeRoadName, district, period, roadTypes }
          : { district, period, roadTypes }
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

  const summaryQuery = useQuery({
    queryKey: ['olap-summary', district, period, roadTypes],
    queryFn: () => olapApi.getSummary({ district, period, roadTypes }).then(res => res.data!),
    staleTime: 60_000,
  })

  const districtRankingQuery = useQuery({
    queryKey: ['olap-district-ranking', period, roadTypes],
    queryFn: () => olapApi.getDistrictRanking({ period, roadTypes }).then(res => res.data!),
    staleTime: 60_000,
  })

  const roadTypeEfficiencyQuery = useQuery({
    queryKey: ['olap-road-type-efficiency', period],
    queryFn: () => olapApi.getRoadTypeComparison({ period }).then(res => res.data!),
    staleTime: 60_000,
  })

  const drilldownTransitionLoading =
    drilldownQuery.isFetching && !drilldownQuery.isLoading

  const handleReset = () => {
    setBubbleMetric('pcu')
    setActiveRoadName(null)
    setDistrict('Quận 1')
    setPeriod('all')
    setRoadTypes(['trunk', 'primary', 'secondary'])
  }

  const summary = summaryQuery.data

  return (
    <div id="olap-dashboard-container" className="olap-dashboard">
      <Card className="olap-card" bodyStyle={{ padding: 16 }}>
        <div className="olap-toolbar-header">
          <div className="olap-toolbar-title-block">
            <Title level={4} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              Trung tâm Phân tích BI & OLAP
              <Text style={{ fontSize: '12px', fontWeight: 'normal', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px' }}>
                Admin View
              </Text>
            </Title>
            <Text type="secondary">
              Phân tích hiệu năng hạ tầng và xu hướng ùn tắc tổng hợp từ Materialized View.
            </Text>
          </div>

          <div className="olap-toolbar-actions">
            <div className="olap-filter-item">
              <Text strong style={{ marginRight: 8 }}>
                Loại đường:
              </Text>
              <Select
                mode="multiple"
                placeholder="Chọn loại đường"
                style={{ width: 280, marginRight: 16 }}
                value={roadTypes}
                onChange={setRoadTypes}
                tagRender={(props) => {
                  const { label, value, closable, onClose } = props
                  const onPreventMouseDown = (event: React.MouseEvent<HTMLSpanElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                  
                  let color = '#64748b' // default
                  let bgColor = '#f1f5f9'
                  if (value === 'trunk') { color = '#dc2626'; bgColor = '#fef2f2' }
                  if (value === 'primary') { color = '#2563eb'; bgColor = '#eff6ff' }
                  if (value === 'secondary') { color = '#0891b2'; bgColor = '#ecfeff' }

                  return (
                    <Tag
                      onMouseDown={onPreventMouseDown}
                      closable={closable}
                      onClose={onClose}
                      style={{ 
                        marginRight: 4, 
                        marginTop: 2, 
                        marginBottom: 2,
                        borderRadius: '6px',
                        fontWeight: 600,
                        color: color,
                        backgroundColor: bgColor,
                        border: `1px solid ${color}44`,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        height: '24px',
                        lineHeight: '22px'
                      }}
                    >
                      {label}
                    </Tag>
                  )
                }}
                options={[
                  { label: 'Trunk', value: 'trunk' },
                  { label: 'Primary', value: 'primary' },
                  { label: 'Secondary', value: 'secondary' },
                ]}
              />
            </div>
            <div className="olap-filter-item">
              <Text strong style={{ marginRight: 8 }}>
                Chu kỳ:
              </Text>
              <Select
                value={period}
                onChange={setPeriod}
                style={{ width: 120, marginRight: 16 }}
                options={[
                  { label: '7 ngày qua', value: 'weekly' },
                  { label: '30 ngày qua', value: 'monthly' },
                  { label: 'Tất cả', value: 'all' },
                ]}
              />
            </div>
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
              Đặt lại
            </Button>
            <Dropdown
              overlay={
                <Menu>
                  <Menu.Item
                    key="png"
                    icon={<FileImageOutlined />}
                    onClick={() =>
                      exportToImage(
                        'olap-dashboard-container',
                        'traffic-analytics-report'
                      )
                    }
                  >
                    Xuất PNG
                  </Menu.Item>
                  <Menu.Item
                    key="pdf"
                    icon={<FilePdfOutlined />}
                    onClick={() =>
                      exportToPdf(
                        'olap-dashboard-container',
                        'traffic-analytics-report'
                      )
                    }
                  >
                    Xuất PDF
                  </Menu.Item>
                </Menu>
              }
            >
              <Button type="primary" icon={<ReloadOutlined />}>
                Xuất báo cáo
              </Button>
            </Dropdown>
          </div>
        </div>
      </Card>

      <ExecutiveSummary 
        loading={summaryQuery.isLoading || districtRankingQuery.isLoading || roadTypeEfficiencyQuery.isLoading}
        summary={summaryQuery.data}
        districtRanking={districtRankingQuery.data}
        roadTypeEfficiency={roadTypeEfficiencyQuery.data}
      />

      {/* KPI Summary Cards */}
      <Spin spinning={summaryQuery.isLoading}>
        <div className="olap-summary-grid">
          <Card className="olap-kpi-card" bodyStyle={{ padding: '20px' }}>
            <div className="olap-kpi-label">Chỉ số Bão hòa (V/C Ratio)</div>
            <div className="olap-kpi-value">{(summary?.avgVcRatio || 0).toFixed(2)}</div>
            <div className="olap-kpi-trend" style={{ color: (summary?.avgVcRatio || 0) > 0.7 ? '#ef4444' : '#10b981' }}>
              {summary?.avgVcRatio && summary.avgVcRatio > 0.7 ? '● Mức độ bão hòa cao' : '● Mức độ ổn định'}
            </div>
          </Card>
          
          <Card className="olap-kpi-card" bodyStyle={{ padding: '20px' }}>
            <div className="olap-kpi-label">Tỷ lệ Ùn tắc (Congestion Index)</div>
            <div className="olap-kpi-value">{((summary?.congestionRate || 0) * 100).toFixed(1)}%</div>
            <div className="olap-kpi-trend" style={{ color: '#64748b' }}>
              Trên tổng số {summary?.roadCount || 0} trục đường chính
            </div>
          </Card>

          <Card className="olap-kpi-card" bodyStyle={{ padding: '20px' }}>
            <div className="olap-kpi-label">Độ tin cậy Di chuyển (Reliability)</div>
            <div className="olap-kpi-value">{((summary?.reliabilityIndex || 0) * 100).toFixed(0)}%</div>
            <div className="olap-kpi-trend" style={{ color: '#10b981' }}>
              ↑ 2.4% so với tháng trước
            </div>
          </Card>

          <Card className="olap-kpi-card" bodyStyle={{ padding: '20px' }}>
            <div className="olap-kpi-label">Thiệt hại Kinh tế ước tính</div>
            <div className="olap-kpi-value">
              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(summary?.economicLoss || 0)}
            </div>
            <div className="olap-kpi-trend" style={{ color: '#ef4444' }}>
              Quy đổi từ {((summary?.avgDelaySeconds || 0) / 60).toFixed(1)}p trễ/xe
            </div>
          </Card>
        </div>
      </Spin>

      <div className="olap-chart-grid">
        <TrafficHeatmapChart data={heatmapQuery.data ?? []} loading={heatmapQuery.isLoading} />
        <CrossAnalysisBubbleChart
          data={crossAnalysisQuery.data ?? []}
          loading={crossAnalysisQuery.isLoading}
          bubbleMetric={bubbleMetric}
          onBubbleMetricChange={setBubbleMetric}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <DrilldownDelayChart
          level={drilldownQuery.data?.level ?? 'road'}
          activeRoadName={activeRoadName}
          data={drilldownQuery.data?.points ?? []}
          loading={drilldownQuery.isLoading || drilldownTransitionLoading}
          onSelectRoad={setActiveRoadName}
          onBackToRoad={() => setActiveRoadName(null)}
        />
        {drilldownQuery.data?.level === 'road' && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <Text type="secondary" italic style={{ fontSize: '12px' }}>
              * Biểu đồ chỉ hiển thị Top 25 tuyến đường có độ trễ lớn nhất để đảm bảo khả năng quan sát.
            </Text>
          </div>
        )}
      </div>

      <div className="olap-chart-grid" style={{ marginTop: 16 }}>
        <DistrictRankingChart 
          data={districtRankingQuery.data ?? []} 
          loading={districtRankingQuery.isLoading} 
        />
        <RoadTypeEfficiencyChart 
          data={roadTypeEfficiencyQuery.data ?? []} 
          loading={roadTypeEfficiencyQuery.isLoading} 
        />
      </div>
    </div>
  )
}
