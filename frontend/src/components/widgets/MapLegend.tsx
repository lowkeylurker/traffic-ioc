// Map Legend Component - Redesigned as a horizontal 6-step box

import React from 'react'
import { Tooltip } from 'antd'

interface LegendItem {
  label: string
  color: string
  range: string
}

export const MapLegend: React.FC = () => {
  const items: LegendItem[] = [
    { label: 'Thông thoáng', color: '#52C41A', range: 'A' },
    { label: 'Khá thông thoáng', color: '#73D13D', range: 'B' },
    { label: 'Trung bình', color: '#FAAD14', range: 'C' },
    { label: 'Mật độ cao', color: '#D46B08', range: 'D' },
    { label: 'Đông xe', color: '#CF1322', range: 'E' },
    { label: 'Ùn tắc nghiêm trọng', color: '#820014', range: 'F' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 44,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(12px)',
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        border: '1px solid rgba(0, 0, 0, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 180,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Horizontal 6-step bar */}
        <div
          style={{
            display: 'flex',
            height: 6,
            borderRadius: 3,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          {items.map((item) => (
            <Tooltip
              key={item.range}
              title={`${item.range}: ${item.label}`}
              placement="top"
            >
              <div
                style={{
                  flex: 1,
                  backgroundColor: item.color,
                  cursor: 'help',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              />
            </Tooltip>
          ))}
        </div>

        {/* Labels at ends */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(0, 0, 0, 0.45)',
            textTransform: 'uppercase',
            marginTop: 1,
            letterSpacing: '0.02em',
          }}
        >
          <span>Nhanh</span>
          <span>Chậm</span>
        </div>
      </div>
    </div>
  )
}
