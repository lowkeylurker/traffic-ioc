// Map Legend Component

import React from 'react'

interface LegendItem {
  label: string
  color: string
  range: string
}

export const MapLegend: React.FC = () => {
  const items: LegendItem[] = [
    { label: 'Thông thoáng', color: '#52C41A', range: 'LOS A' },
    { label: 'Khá thông thoáng', color: '#73D13D', range: 'LOS B' },
    { label: 'Trung bình', color: '#FAAD14', range: 'LOS C' },
    { label: 'Mật độ cao', color: '#D46B08', range: 'LOS D' },
    { label: 'Đông xe', color: '#CF1322', range: 'LOS E' },
    { label: 'Ùn tắc nghiêm trọng', color: '#820014', range: 'LOS F' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 44,
        zIndex: 10,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        padding: '6px 8px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.10)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(0, 0, 0, 0.65)',
          alignSelf: 'flex-start',
        }}
      >
        LOS
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 6 }}
      >
        {items.map((item) => (
          <div
            key={item.range}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 160,
            }}
            title={item.range}
          >
            <div
              style={{
                width: 14,
                height: 3,
                borderRadius: 2,
                backgroundColor: item.color,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#001529',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.range}: {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
