// Weather Widget

import React from 'react'
import { Card } from 'antd'
import { CloudOutlined } from '@ant-design/icons'
import { Cloud, CloudRain } from 'lucide-react'
import { MOCK_WEATHER } from '@/config/constants'

interface WeatherWidgetProps {
  style?: React.CSSProperties
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ style }) => {
  const weather = MOCK_WEATHER

  return (
    <Card
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        width: 280,
        zIndex: 10,
        ...style,
      }}
      bodyStyle={{ padding: '12px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: '0 0 8px 0' }}>Thời tiết</h4>
          <p style={{ margin: 4 }}>
            {weather.condition} - {weather.temperature}°C
          </p>
          <p style={{ margin: 4, fontSize: 12, color: '#666' }}>Độ ẩm: {weather.humidity}%</p>
          {weather.rainfall > 0 && (
            <p style={{ margin: 4, fontSize: 12, color: '#ff7a45' }}>Mưa: {weather.rainfall}mm</p>
          )}
        </div>
        <div style={{ fontSize: 32, color: '#faad14' }}>
          {weather.rainfall > 0 ? (
            <CloudRain size={32} />
          ) : (
            <Cloud size={32} />
          )}
        </div>
      </div>
    </Card>
  )
}
