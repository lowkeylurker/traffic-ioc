import React from 'react'
import { Card, Typography } from 'antd'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'

const { Text } = Typography

interface TrendCardProps {
  title: string
  value: string | number
  unit?: string
  trendData: { value: number }[]
  color?: string
  prefix?: React.ReactNode
  percentChange?: number
}

export const TrendCard: React.FC<TrendCardProps> = ({
  title,
  value,
  unit,
  trendData,
  color = '#1890ff',
  prefix,
  percentChange,
}) => {
  return (
    <Card
      size="small"
      bodyStyle={{ padding: '12px' }}
      style={{
        borderRadius: 12,
        minWidth: 160,
        flex: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        border: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase' }}>
          {title}
        </Text>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {prefix && <span style={{ color }}>{prefix}</span>}
          <Text strong style={{ fontSize: 20 }}>
            {value}
          </Text>
          {unit && <Text type="secondary" style={{ fontSize: 12 }}>{unit}</Text>}
        </div>
        
        {percentChange !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            {percentChange >= 0 ? (
              <ArrowUpOutlined style={{ color: '#52c41a' }} />
            ) : (
              <ArrowDownOutlined style={{ color: '#f5222d' }} />
            )}
            <span style={{ color: percentChange >= 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>
              {Math.abs(percentChange).toFixed(1)}%
            </span>
          </div>
        )}

        <div style={{ width: '100%', height: 32, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id={`gradient-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#gradient-${title.replace(/\s+/g, '')})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  )
}
