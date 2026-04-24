import { usePlaceSearch } from '@/hooks/usePlaceSearch'
import { PlaceSearchResult } from '@/types'
import { AimOutlined, EnvironmentOutlined } from '@ant-design/icons'
import { AutoComplete, Button, Input, Spin, Tooltip } from 'antd'
import React, { useMemo } from 'react'

type RoutingPlaceAutoCompleteProps = {
  value: string
  active: boolean
  pinColor: string
  placeholder: string
  onFocus: () => void
  onChange: (value: string) => void
  onSelectPlace: (place: PlaceSearchResult) => void
  onUseCurrentLocation: () => void
}

export const RoutingPlaceAutoComplete: React.FC<
  RoutingPlaceAutoCompleteProps
> = ({
  value,
  active,
  pinColor,
  placeholder,
  onFocus,
  onChange,
  onSelectPlace,
  onUseCurrentLocation,
}) => {
  const { loading, results } = usePlaceSearch(value)

  const options = useMemo(
    () => [
      {
        value: '__CURRENT_LOCATION__',
        label: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: '#0e7490' }}>
              Vị trí hiện tại của tôi
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Dùng GPS thiết bị để đặt vị trí
            </span>
          </div>
        ),
      },
      ...results.map((place) => ({
        value: place.name,
        label: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: '#111827' }}>
              {place.name}
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {place.address}
            </span>
          </div>
        ),
        place,
      })),
    ],
    [results]
  )

  const handleSelect = (_value: string, option: unknown) => {
    const typedOption = option as { value?: string; place?: PlaceSearchResult }

    if (typedOption.value === '__CURRENT_LOCATION__') {
      onUseCurrentLocation()
      return
    }

    if (typedOption.place) {
      onSelectPlace(typedOption.place)
    }
  }

  return (
    <AutoComplete
      value={value}
      options={options}
      onSelect={handleSelect}
      onSearch={onChange}
      onChange={onChange}
      onFocus={onFocus}
      placeholder={placeholder}
      filterOption={false}
      style={{ width: '100%' }}
    >
      <Input
        variant="filled"
        placeholder={placeholder}
        prefix={<EnvironmentOutlined style={{ color: pinColor }} />}
        suffix={
          <>
            {loading && <Spin size="small" />}
            <Tooltip title="Lấy vị trí hiện tại của tôi">
              <Button
                type="text"
                size="small"
                icon={<AimOutlined />}
                onClick={(event) => {
                  event.stopPropagation()
                  onUseCurrentLocation()
                }}
                style={{ color: '#0e7490' }}
              />
            </Tooltip>
          </>
        }
        style={{
          padding: '8px 12px',
          border: active ? `1px solid ${pinColor}` : '1px solid transparent',
          transition: 'all 0.3s',
        }}
      />
    </AutoComplete>
  )
}
