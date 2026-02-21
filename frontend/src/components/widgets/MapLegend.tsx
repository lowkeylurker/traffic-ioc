// Map Legend Component

import React from 'react'

interface LegendItem {
  label: string
  color: string
  range: string
}

export const MapLegend: React.FC = () => {
  const items: LegendItem[] = [
    { label: 'Thông thoáng', color: '#52c41a', range: '> 40 km/h' },
    { label: 'Đông xe', color: '#faad14', range: '15 - 40 km/h' },
    { label: 'Ùn tắc', color: '#ff4d4f', range: '< 15 km/h' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 44,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        borderRadius: 8,
        padding: '4px',
        boxShadow:
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        transition: 'all 0.3s ease',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow =
          '0 12px 48px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow =
          '0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 2px 8px 0 rgba(0, 0, 0, 0.04)'
      }}
    >
      <div
        style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0, 0, 0, 0.65)' }}
      >
        📏
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingRight: index < items.length - 1 ? 8 : 0,
            borderRight:
              index < items.length - 1
                ? '1px solid rgba(0, 0, 0, 0.06)'
                : 'none',
          }}
        >
          <div
            style={{
              width: 16,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: item.color,
              flexShrink: 0,
              boxShadow: `0 1px 2px ${item.color}40`,
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#001529',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}
