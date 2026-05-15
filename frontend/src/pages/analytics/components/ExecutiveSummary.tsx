import { OlapDistrictRankingItem, OlapRoadTypeEfficiencyItem, OlapSummary } from '@/types'
import { Card, Skeleton, Space, Typography } from 'antd'
import { InfoCircleOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons'
import React, { useMemo } from 'react'

const { Title, Text } = Typography

interface ExecutiveSummaryProps {
  summary?: OlapSummary
  districtRanking?: OlapDistrictRankingItem[]
  roadTypeEfficiency?: OlapRoadTypeEfficiencyItem[]
  loading?: boolean
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  summary,
  districtRanking,
  roadTypeEfficiency,
  loading = false,
}) => {
  const insights = useMemo(() => {
    if (!summary || !districtRanking || !roadTypeEfficiency) return []

    const items: Array<{ type: 'info' | 'warning' | 'success'; text: string; icon: React.ReactNode }> = []

    // 1. Worst District
    const worstDistrict = districtRanking[0]
    if (worstDistrict && worstDistrict.avgTrafficIndex > 0.4) {
      items.push({
        type: 'warning',
        icon: <WarningOutlined />,
        text: `Khu vực ${worstDistrict.district} đang có mức độ ùn tắc cao nhất (Traffic Index: ${worstDistrict.avgTrafficIndex.toFixed(2)}).`,
      })
    }

    // 2. Efficiency insight
    const trunkEff = roadTypeEfficiency.find(t => t.type === 'trunk')
    if (trunkEff && trunkEff.avgVcRatio > 0.8) {
      items.push({
        type: 'warning',
        icon: <ThunderboltOutlined />,
        text: `Các trục đường chính (Trunk) đang vận hành quá tải với chỉ số V/C đạt ${trunkEff.avgVcRatio.toFixed(2)}.`,
      })
    } else if (trunkEff) {
      items.push({
        type: 'success',
        icon: <ThunderboltOutlined />,
        text: `Hệ thống trục chính đang vận hành ổn định trong ngưỡng thiết kế.`,
      })
    }

    // 3. Economic impact
    if (summary.economicLoss > 1000000000) {
       items.push({
        type: 'info',
        icon: <InfoCircleOutlined />,
        text: `Thiệt hại kinh tế ước tính đạt ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(summary.economicLoss)}, cần các biện pháp điều tiết khẩn cấp.`,
      })
    }

    return items
  }, [summary, districtRanking, roadTypeEfficiency])

  if (loading) {
    return (
      <Card className="olap-card" style={{ marginBottom: 16 }}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    )
  }

  if (insights.length === 0) return null

  return (
    <Card 
      className="olap-card executive-summary-card" 
      style={{ 
        marginBottom: 16, 
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
        border: '1px solid #bae6fd'
      }}
    >
      <Title level={5} style={{ color: '#0369a1', marginBottom: 12 }}>
        <ThunderboltOutlined style={{ marginRight: 8 }} />
        Tóm tắt Chiến lược (Strategic Insights)
      </Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        {insights.map((insight, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <span style={{ color: insight.type === 'warning' ? '#ef4444' : insight.type === 'success' ? '#10b981' : '#3b82f6', marginTop: 4 }}>
              {insight.icon}
            </span>
            <Text style={{ fontSize: 14 }}>{insight.text}</Text>
          </div>
        ))}
      </Space>
    </Card>
  )
}
