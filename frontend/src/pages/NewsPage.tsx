import { userApi } from '@/services/api'
import { NewsFeedResponse, UserNewsItem } from '@/types'
import {
  CameraOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useAuth } from '@clerk/clerk-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert,
  Button,
  Card,
  Empty,
  FloatButton,
  Form,
  Image,
  Input,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { AxiosError } from 'axios'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, NavigationControl, ViewState } from 'react-map-gl'

dayjs.extend(relativeTime)

type IncidentReportType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION'

const INCIDENT_OPTIONS: Array<{ label: string; value: IncidentReportType }> = [
  { label: 'Tai nan', value: 'ACCIDENT' },
  { label: 'Ngap', value: 'FLOOD' },
  { label: 'Tac duong', value: 'CONGESTION' },
]

const getIncidentIcon = (type: string) => {
  const normalized = type.toUpperCase()
  if (normalized === 'ACCIDENT') {
    return (
      <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 18 }} />
    )
  }

  if (normalized === 'FLOOD') {
    return <ThunderboltOutlined style={{ color: '#0284c7', fontSize: 18 }} />
  }

  if (normalized === 'CONGESTION') {
    return <FireOutlined style={{ color: '#d97706', fontSize: 18 }} />
  }

  return (
    <ExclamationCircleOutlined style={{ color: '#6b7280', fontSize: 18 }} />
  )
}

const maxImageSizeMb = 5

const DEFAULT_VIEW_STATE: ViewState = {
  latitude: 10.7769,
  longitude: 106.7009,
  zoom: 13.5,
  bearing: 0,
  pitch: 0,
}

const getIncidentMarkerColor = (type: string): string => {
  const normalized = type.toUpperCase()
  if (normalized === 'ACCIDENT') return '#ef4444'
  if (normalized === 'FLOOD') return '#0284c7'
  if (normalized === 'CONGESTION') return '#d97706'
  return '#6b7280'
}

export const NewsPage: React.FC = () => {
  const { isSignedIn } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()
  const [isReportModalOpen, setReportModalOpen] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; long: number } | null>(
    null
  )
  const [locationError, setLocationError] = useState<string>('')
  const [locationLoading, setLocationLoading] = useState<boolean>(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null
  )
  const [reportForm] = Form.useForm()
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE)
  const incidentCardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapStyle =
    import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12'

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Trinh duyet khong ho tro geolocation.')
      return
    }

    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          long: Number(position.coords.longitude.toFixed(6)),
        })
        setLocationError('')
        setLocationLoading(false)
      },
      () => {
        setLocationLoading(false)
        setLocationError(
          'Không thể lấy vị trí. Vui lòng cho phép truy cập vị trí hoặc thử lại.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchLocation()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!coords) {
      return
    }

    setViewState((prev) => ({
      ...prev,
      latitude: coords.lat,
      longitude: coords.long,
      zoom: Math.max(prev.zoom, 14),
      bearing: 0,
      pitch: 0,
    }))
  }, [coords])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['user-news', coords?.lat, coords?.long],
    enabled: Boolean(coords),
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<NewsFeedResponse> => {
      if (!coords) {
        return { items: [] }
      }

      const response = await userApi.getNews({
        lat: coords.lat,
        long: coords.long,
        radius: 5,
      })

      return response.data ?? { items: [] }
    },
  })

  const submitMutation = useMutation({
    mutationFn: async (payload: {
      incidentType: IncidentReportType
      lat: number
      long: number
      description?: string
      image?: File | null
    }) => {
      const formData = new FormData()
      formData.append('incidentType', payload.incidentType)
      formData.append('lat', String(payload.lat))
      formData.append('long', String(payload.long))
      if (payload.description) {
        formData.append('description', payload.description)
      }

      if (payload.image) {
        formData.append('image', payload.image)
      }

      return userApi.submitReport(formData)
    },
    onSuccess: (response) => {
      messageApi.success(
        response.data?.message || 'Cam on, bao cao dang cho duyet'
      )
      setReportModalOpen(false)
      setSelectedFile(null)
      reportForm.resetFields()
      refetch()
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      const apiMessage =
        error.response?.data?.message ||
        'Gui bao cao that bai. Vui long thu lai.'
      messageApi.error(apiMessage)
    },
  })

  const cards = useMemo(() => data?.items || [], [data])

  const focusIncident = (incident: UserNewsItem, scrollCard: boolean) => {
    setSelectedIncidentId(incident.incidentId)
    setViewState((prev) => ({
      ...prev,
      latitude: incident.location.lat,
      longitude: incident.location.long,
      zoom: Math.max(prev.zoom, 15.5),
      bearing: 0,
      pitch: 0,
    }))

    if (scrollCard) {
      const targetCard = incidentCardRefs.current[incident.incidentId]
      targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleReportSubmit = async () => {
    if (!isSignedIn) {
      messageApi.warning('Vui long dang nhap de gui bao cao.')
      return
    }

    try {
      const values = await reportForm.validateFields()
      const lat = Number(values.lat)
      const long = Number(values.long)

      if (!Number.isFinite(lat) || !Number.isFinite(long)) {
        messageApi.error('Toa do khong hop le.')
        return
      }

      submitMutation.mutate({
        incidentType: values.incidentType,
        lat,
        long,
        description: values.description,
        image: selectedFile,
      })
    } catch {
      // validation errors are handled by Form.Item
    }
  }

  return (
    <div className="news-two-column-page">
      {contextHolder}

      <div className="news-left-column">
        <div style={{ padding: 12 }}>
          <Space
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 12,
              alignItems: 'center',
            }}
          >
            <Typography.Title level={4} style={{ margin: 0 }}>
              Tin tức giao thông quanh bạn
            </Typography.Title>
            <Button
              icon={<ReloadOutlined />}
              size="large"
              loading={isFetching}
              onClick={() => refetch()}
            >
              Làm mới
            </Button>
          </Space>

          <Card style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text type="secondary">
                Vị trí hiện tại
              </Typography.Text>

              {coords ? (
                <Space wrap>
                  <Tag icon={<EnvironmentOutlined />} color="blue">
                    Kinh độ: {coords.lat}
                  </Tag>
                  <Tag icon={<EnvironmentOutlined />} color="geekblue">
                    Vĩ độ: {coords.long}
                  </Tag>
                </Space>
              ) : null}

              {locationError ? (
                <Alert type="warning" message={locationError} />
              ) : null}

              <Button
                size="large"
                onClick={fetchLocation}
                loading={locationLoading}
              >
                Lấy lại vị trí
              </Button>
            </Space>
          </Card>

          <Card bodyStyle={{ padding: 8 }}>
            <List
              loading={isLoading}
              dataSource={cards}
              locale={{
                emptyText: (
                  <Empty description="Chưa có sự cố nào xảy ra xung quanh bạn" />
                ),
              }}
              renderItem={(item: UserNewsItem) => (
                <List.Item key={item.incidentId} style={{ padding: 8 }}>
                  <div
                    ref={(el) => {
                      incidentCardRefs.current[item.incidentId] = el
                    }}
                    style={{ width: '100%' }}
                  >
                    <Card
                      style={{ width: '100%' }}
                      bodyStyle={{ padding: 12 }}
                      size="small"
                      hoverable
                      onClick={() => focusIncident(item, false)}
                      className={
                        selectedIncidentId === item.incidentId
                          ? 'incident-card-selected'
                          : ''
                      }
                    >
                      <Space style={{ width: '100%' }} align="start">
                        <div style={{ marginTop: 2 }}>
                          {getIncidentIcon(item.incidentType)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <Typography.Text strong>
                            {item.roadName}
                          </Typography.Text>
                          <div>
                            <Tag>{item.incidentType}</Tag>
                            <Tag color="default">
                              {dayjs(item.occurredAt).fromNow()}
                            </Tag>
                            <Tag color="purple">
                              {item.distanceKm.toFixed(2)} km
                            </Tag>
                          </div>
                        </div>
                      </Space>

                      {item.imageUrl ? (
                        <div style={{ marginTop: 10 }}>
                          <Image
                            src={item.imageUrl}
                            alt="incident"
                            width="100%"
                            style={{
                              borderRadius: 8,
                              objectFit: 'cover',
                              maxHeight: 220,
                            }}
                          />
                        </div>
                      ) : null}
                    </Card>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </div>
      </div>

      <div className="news-right-column">
        <Card
          style={{ height: '100%', borderRadius: 0 }}
          bodyStyle={{ height: '100%', padding: 0 }}
        >
          <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            mapboxAccessToken={mapboxToken}
            mapStyle={mapStyle}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
          >
            <NavigationControl position="top-right" />
            {cards.map((incident) => (
              <Marker
                key={incident.incidentId}
                longitude={incident.location.long}
                latitude={incident.location.lat}
                anchor="bottom"
              >
                <button
                  type="button"
                  onClick={() => focusIncident(incident, true)}
                  aria-label={`Incident ${incident.incidentType} on ${incident.roadName}`}
                  style={{
                    width: selectedIncidentId === incident.incidentId ? 18 : 14,
                    height:
                      selectedIncidentId === incident.incidentId ? 18 : 14,
                    borderRadius: '50%',
                    border:
                      selectedIncidentId === incident.incidentId
                        ? '3px solid #111827'
                        : '2px solid #ffffff',
                    background: getIncidentMarkerColor(incident.incidentType),
                    boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              </Marker>
            ))}
            {coords ? (
              <Marker longitude={coords.long} latitude={coords.lat}>
                <EnvironmentOutlined
                  style={{
                    fontSize: 28,
                    color: '#ef4444',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                  }}
                />
              </Marker>
            ) : null}
          </Map>
        </Card>
      </div>

      <FloatButton
        icon={<PlusOutlined />}
        type="primary"
        tooltip="Báo cáo sự cố"
        onClick={() => {
          if (!coords) {
            messageApi.warning('Cần có vị trí để gửi báo cáo.')
          }
          setReportModalOpen(true)
        }}
        style={{ right: 20, bottom: 20, width: 64, height: 64 }}
      />

      <Modal
        title="Báo cáo sự cố"
        open={isReportModalOpen}
        onCancel={() => {
          if (!submitMutation.isPending) {
            setReportModalOpen(false)
          }
        }}
        onOk={handleReportSubmit}
        okText="Gửi báo cáo"
        okButtonProps={{ loading: submitMutation.isPending, size: 'large' }}
        cancelButtonProps={{ size: 'large' }}
        width={560}
        destroyOnClose
      >
        <Form
          form={reportForm}
          layout="vertical"
          initialValues={{
            incidentType: 'ACCIDENT',
            lat: coords?.lat,
            long: coords?.long,
          }}
        >
          {!isSignedIn ? (
            <Alert
              style={{ marginBottom: 12 }}
              type="warning"
              message="Bạn cần đăng nhập trước khi gửi báo cáo."
            />
          ) : null}

          <Form.Item
            name="incidentType"
            label="Loại sự cố"
            rules={[{ required: true, message: 'Vui lòng chọn loại sự cố' }]}
          >
            <Select size="large" options={INCIDENT_OPTIONS} />
          </Form.Item>

          <Space style={{ width: '100%' }} size={12}>
            <Form.Item
              style={{ flex: 1 }}
              name="lat"
              label="Kinh độ"
              rules={[{ required: true, message: 'Vui lòng nhập kinh độ' }]}
            >
              <Input size="large" />
            </Form.Item>
            <Form.Item
              style={{ flex: 1 }}
              name="long"
              label="Vĩ độ"
              rules={[{ required: true, message: 'Vui lòng nhập vĩ độ' }]}
            >
              <Input size="large" />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="Mô tả ngắn (tùy chọn)">
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>

          <Form.Item label="Ảnh minh chứng (tùy chọn)">
            <Upload
              accept="image/jpeg,image/png,image/webp"
              maxCount={1}
              beforeUpload={(file) => {
                const isValidType = [
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                ].includes(file.type)
                if (!isValidType) {
                  messageApi.error('Chỉ hỗ trợ JPEG, PNG, WEBP')
                  return Upload.LIST_IGNORE
                }

                if (file.size > maxImageSizeMb * 1024 * 1024) {
                  messageApi.error(`Ảnh phải nhỏ hơn ${maxImageSizeMb}MB`)
                  return Upload.LIST_IGNORE
                }

                setSelectedFile(file)
                return false
              }}
              onRemove={() => {
                setSelectedFile(null)
              }}
            >
              <Button icon={<CameraOutlined />} size="large">
                Chọn ảnh
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .news-two-column-page {
          display: grid;
          grid-template-columns: minmax(360px, 1fr) minmax(360px, 1fr);
          gap: 12px;
          height: 100dvh;
        }

        .news-left-column {
          min-height: 0;
          overflow-y: auto;
          border-radius: 10px;
          background: #f0f2f5;
        }

        .news-right-column {
          min-height: 0;
          overflow: hidden;
          border-radius: 10px;
        }

        .news-right-column .ant-card,
        .news-right-column .ant-card-body {
          height: 100%;
        }

        .incident-card-selected {
          border-color: #1677ff !important;
          box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
        }

        @media (max-width: 1100px) {
          .news-two-column-page {
            grid-template-columns: 1fr;
            height: auto;
          }

          .news-right-column {
            height: 360px;
          }
        }
      `}</style>
    </div>
  )
}
