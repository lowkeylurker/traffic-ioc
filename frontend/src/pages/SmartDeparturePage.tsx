import { searchApi, simulationApi } from '@/services/api'
import type {
  PlaceSearchResult,
  SmartDepartureResponse,
  SmartDepartureSuggestion,
} from '@/types'
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  Grid,
  Select,
  Space,
  TimePicker,
  Typography,
  message,
  theme,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import React, { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

interface FormValues {
  from: string
  to: string
  targetArrival: Dayjs
  dayOfWeek: number
}

const DAY_OPTIONS = [
  { label: 'Thứ Hai', value: 1 },
  { label: 'Thứ Ba', value: 2 },
  { label: 'Thứ Tư', value: 3 },
  { label: 'Thứ Năm', value: 4 },
  { label: 'Thứ Sáu', value: 5 },
  { label: 'Thứ Bảy', value: 6 },
  { label: 'Chủ Nhật', value: 7 },
]

const mapPlaceOptions = (places: PlaceSearchResult[]) =>
  places.map((place) => ({
    value: place.id,
    label: `${place.name} - ${place.address}`,
  }))

const extractSegmentIdsFromRoute = (routeData: any): string[] => {
  const features = Array.isArray(routeData?.features) ? routeData.features : []
  const ids: string[] = []

  for (const feature of features) {
    const properties = feature?.properties ?? {}
    const candidates = [
      properties.segment_id,
      properties.segmentId,
      properties.segment_key,
      properties.segmentKey,
      properties.route_edge,
    ]

    for (const value of candidates) {
      if (typeof value === 'string' && /^\d+$/.test(value)) {
        ids.push(value)
        break
      }

      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        ids.push(String(value))
        break
      }
    }
  }

  return Array.from(new Set(ids))
}

const SmartDepartureSetupForm: React.FC<{
  loading: boolean
  fromOptions: Array<{ value: string; label: string }>
  toOptions: Array<{ value: string; label: string }>
  onSearchFrom: (keyword: string) => Promise<void>
  onSearchTo: (keyword: string) => Promise<void>
  onSubmit: (values: FormValues) => void
}> = ({ loading, fromOptions, toOptions, onSearchFrom, onSearchTo, onSubmit }) => {
  return (
    <>
      <Title level={4} style={{ marginBottom: 8 }}>
        Lên kế hoạch khởi hành thông minh
      </Title>
      <Text type="secondary">
        Nhập điểm đi, điểm đến và giờ cần có mặt để hệ thống đề xuất thời điểm xuất phát tối ưu.
      </Text>

      <Form<FormValues>
        layout="vertical"
        style={{ marginTop: 16 }}
        onFinish={onSubmit}
        initialValues={{
          targetArrival: dayjs('08:30', 'HH:mm'),
          dayOfWeek: 1,
        }}
      >
        <Form.Item
          label="Điểm đi"
          name="from"
          rules={[{ required: true, message: 'Vui lòng chọn điểm đi' }]}
        >
          <Select
            size="large"
            showSearch
            placeholder="Chọn điểm đi"
            optionFilterProp="label"
            options={fromOptions}
            filterOption={false}
            onSearch={onSearchFrom}
            suffixIcon={<EnvironmentOutlined />}
          />
        </Form.Item>

        <Form.Item
          label="Điểm đến"
          name="to"
          rules={[{ required: true, message: 'Vui lòng chọn điểm đến' }]}
        >
          <Select
            size="large"
            showSearch
            placeholder="Chọn điểm đến"
            optionFilterProp="label"
            options={toOptions}
            filterOption={false}
            onSearch={onSearchTo}
            suffixIcon={<EnvironmentOutlined />}
          />
        </Form.Item>

        <Space size={12} style={{ width: '100%' }} direction="vertical">
          <Form.Item
            label="Giờ cần có mặt"
            name="targetArrival"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
            style={{ marginBottom: 0 }}
          >
            <TimePicker
              size="large"
              format="HH:mm"
              style={{ width: '100%' }}
              minuteStep={5}
            />
          </Form.Item>

          <Form.Item
            label="Thứ trong tuần"
            name="dayOfWeek"
            rules={[{ required: true, message: 'Vui lòng chọn thứ' }]}
            style={{ marginBottom: 0 }}
          >
            <Select size="large" options={DAY_OPTIONS} />
          </Form.Item>
        </Space>

        <Button
          type="primary"
          size="large"
          block
          htmlType="submit"
          loading={loading}
          style={{ marginTop: 16 }}
        >
          Phân tích lộ trình tối ưu
        </Button>
      </Form>
    </>
  )
}

const SmartDepartureResult: React.FC<{
  result: SmartDepartureResponse
  onBack: () => void
}> = ({ result, onBack }) => {
  const { token } = theme.useToken()

  const optimalSuggestion = useMemo(
    () => result.suggestions.find((item) => item.is_optimal) ?? null,
    [result.suggestions]
  )

  const maxDuration = useMemo(
    () =>
      result.suggestions.length > 0
        ? Math.max(...result.suggestions.map((item) => item.estimated_duration_minutes))
        : 0,
    [result.suggestions]
  )

  const chartData = useMemo(
    () =>
      [...result.suggestions].sort((a, b) =>
        a.departure_time.localeCompare(b.departure_time)
      ),
    [result.suggestions]
  )

  const getBarColor = (item: SmartDepartureSuggestion): string => {
    if (item.is_optimal) {
      return '#52c41a'
    }

    if (item.estimated_duration_minutes === maxDuration) {
      return '#ff4d4f'
    }

    return token.colorPrimary
  }

  const insightNode = (() => {
    if (!optimalSuggestion) {
      return (
        <Text>
          Chưa có mốc nào đảm bảo đến đúng giờ trong điều kiện hiện tại. Hãy cân nhắc đi sớm hơn hoặc đổi lộ trình.
        </Text>
      )
    }

    const savedMinutes = Math.max(
      0,
      maxDuration - optimalSuggestion.estimated_duration_minutes
    )

    const estimatedArrival = dayjs(
      `${optimalSuggestion.departure_time}`,
      'HH:mm'
    )
      .add(optimalSuggestion.estimated_duration_minutes, 'minute')
      .format('HH:mm')

    return (
      <Text>
        Nên đi lúc <Text strong>{optimalSuggestion.departure_time}</Text> để tiết kiệm{' '}
        <Text strong>{savedMinutes} phút</Text> và đến nơi lúc{' '}
        <Text strong>{estimatedArrival}</Text>.
      </Text>
    )
  })()

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ paddingInline: 0 }}>
        Quay lại thiết lập
      </Button>

      <Title level={4} style={{ marginTop: 0, marginBottom: 8 }}>
        Kết quả gợi ý giờ khởi hành
      </Title>

      <Alert
        type={optimalSuggestion ? 'success' : 'info'}
        showIcon
        message={insightNode}
        style={{ marginBottom: 16 }}
      />

      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 8, left: 8, bottom: 8 }}>
            <XAxis dataKey="departure_time" tickLine={false} axisLine={false} />
            <YAxis hide />
            <Bar dataKey="estimated_duration_minutes" radius={[8, 8, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.departure_time} fill={getBarColor(entry)} />
              ))}
              <LabelList
                dataKey="estimated_duration_minutes"
                position="top"
                formatter={(value: number) => `${value}p`}
                style={{ fill: token.colorText, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Text type="secondary">
        Cột xanh là mốc tối ưu, cột đỏ là mốc có thời gian di chuyển dài nhất.
      </Text>
    </>
  )
}

export const SmartDeparturePage: React.FC = () => {
  const screens = useBreakpoint()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SmartDepartureResponse | null>(null)
  const [fromOptions, setFromOptions] = useState<Array<{ value: string; label: string }>>([])
  const [toOptions, setToOptions] = useState<Array<{ value: string; label: string }>>([])
  const [placeById, setPlaceById] = useState<Record<string, PlaceSearchResult>>({})

  const handlePlaceSearch = async (
    keyword: string,
    setOptions: React.Dispatch<React.SetStateAction<Array<{ value: string; label: string }>>>
  ) => {
    if (!keyword || keyword.trim().length < 2) {
      setOptions([])
      return
    }

    try {
      const places = await searchApi.searchPlaces(keyword.trim())
      setOptions(mapPlaceOptions(places))
      setPlaceById((prev) => {
        const next = { ...prev }
        for (const place of places) {
          next[place.id] = place
        }
        return next
      })
    } catch {
      setOptions([])
    }
  }

  const panelBody = (
    <div style={{ padding: 16 }}>
      {!result ? (
        <SmartDepartureSetupForm
          loading={loading}
          fromOptions={fromOptions}
          toOptions={toOptions}
          onSearchFrom={(keyword) => handlePlaceSearch(keyword, setFromOptions)}
          onSearchTo={(keyword) => handlePlaceSearch(keyword, setToOptions)}
          onSubmit={async (values) => {
            const fromPlace = placeById[values.from]
            const toPlace = placeById[values.to]

            if (!fromPlace || !toPlace) {
              message.error('Không tìm thấy thông tin tọa độ điểm đi/đến. Vui lòng chọn lại từ danh sách gợi ý.')
              return
            }

            setLoading(true)
            try {
              const routeResponse = await simulationApi.getDynamicRoute(
                fromPlace.lat,
                fromPlace.lon,
                toPlace.lat,
                toPlace.lon
              )

              const routeData = routeResponse.data
              const segmentIds = extractSegmentIdsFromRoute(routeData)

              if (segmentIds.length === 0) {
                message.error('Không thể suy ra segment của lộ trình. Vui lòng thử lại tuyến khác.')
                return
              }

              const apiResponse = await simulationApi.getSmartDeparture({
                segment_ids: segmentIds,
                target_arrival_time: values.targetArrival.format('HH:mm'),
                day_of_week: values.dayOfWeek,
              })

              if (apiResponse.data) {
                setResult(apiResponse.data)
                return
              }

              message.error('Không nhận được dữ liệu gợi ý từ server.')
            } catch {
              message.error('Không thể phân tích lộ trình. Vui lòng thử lại sau.')
            } finally {
              setLoading(false)
            }
          }}
        />
      ) : (
        <SmartDepartureResult result={result} onBack={() => setResult(null)} />
      )}
    </div>
  )

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 15% 20%, rgba(24, 144, 255, 0.2), transparent 38%), radial-gradient(circle at 82% 10%, rgba(82, 196, 26, 0.2), transparent 34%), linear-gradient(135deg, #0b1f3a 0%, #174a7a 45%, #2383a9 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08) 0 1px, transparent 1px 18px)',
            opacity: 0.35,
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.14)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 600,
          }}
        >
          <RocketOutlined />
          Smart Departure Map
        </div>
      </div>

      {screens.md ? (
        <Card
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            width: 420,
            maxWidth: 'calc(100vw - 40px)',
            borderRadius: 16,
            boxShadow: '0 20px 40px rgba(6, 18, 38, 0.25)',
          }}
          styles={{ body: { padding: 0 } }}
        >
          {panelBody}
        </Card>
      ) : (
        <Drawer
          placement="bottom"
          open
          closable={false}
          mask={false}
          height="auto"
          styles={{
            body: { padding: 0, maxHeight: '68vh', overflow: 'auto' },
            content: {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 -16px 30px rgba(3, 15, 32, 0.22)',
            },
            header: {
              borderBottom: 'none',
              paddingBlock: 10,
            },
          }}
          title={
            <Space size={8}>
              <FieldTimeOutlined />
              <Text strong>Smart Departure Suggestion</Text>
            </Space>
          }
        >
          {panelBody}
        </Drawer>
      )}
    </div>
  )
}
