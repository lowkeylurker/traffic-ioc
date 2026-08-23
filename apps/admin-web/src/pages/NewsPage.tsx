import { userApi } from '@/services/api'
import { CitizenReportItem, NewsFeedResponse, UserNewsItem } from '@/types'
import {
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
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
  Statistic,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { AxiosError } from 'axios'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'mapbox-gl/dist/mapbox-gl.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  MapLayerMouseEvent,
  Marker,
  NavigationControl,
  ViewState,
  ViewStateChangeEvent,
} from 'react-map-gl'

dayjs.extend(relativeTime)

type IncidentReportType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION'

const INCIDENT_OPTIONS: Array<{ label: string; value: IncidentReportType }> = [
  { label: 'Tai nạn', value: 'ACCIDENT' },
  { label: 'Ngập', value: 'FLOOD' },
  { label: 'Tắc đường', value: 'CONGESTION' },
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
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
}

const getIncidentMarkerColor = (type: string): string => {
  const normalized = type.toUpperCase()
  if (normalized === 'ACCIDENT') return '#ef4444'
  if (normalized === 'FLOOD') return '#0284c7'
  if (normalized === 'CONGESTION') return '#d97706'
  return '#6b7280'
}

const reportStatusColor = (status: string): string => {
  const normalized = status.toUpperCase()
  if (normalized === 'APPROVED') return 'green'
  if (normalized === 'REJECTED') return 'red'
  return 'gold'
}

const reportStatusLabel = (status: string): string => {
  const normalized = status.toUpperCase()
  if (normalized === 'APPROVED') return 'Đã duyệt'
  if (normalized === 'REJECTED') return 'Đã từ chối'
  return 'Chờ duyệt'
}

const incidentTypeLabel = (type: string): string => {
  const normalized = type.toUpperCase()
  if (normalized === 'ACCIDENT') return 'Tai nạn'
  if (normalized === 'FLOOD') return 'Ngập'
  if (normalized === 'CONGESTION') return 'Tắc đường'
  return type
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
  const [locationAccuracyM, setLocationAccuracyM] = useState<number | null>(
    null
  )
  const [isPickingLocation, setIsPickingLocation] = useState<boolean>(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(
    null
  )
  const [activeLeftTab, setActiveLeftTab] = useState<'feed' | 'mine'>('feed')
  const [reportForm] = Form.useForm()
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE)
  const incidentCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const geoWatchIdRef = useRef<number | null>(null)
  const geoTimeoutRef = useRef<number | null>(null)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapStyle =
    import.meta.env.VITE_MAPBOX_STYLE || 'mapbox://styles/mapbox/streets-v12'

  const clearGeoTracking = useCallback(() => {
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current)
      geoWatchIdRef.current = null
    }

    if (geoTimeoutRef.current !== null) {
      window.clearTimeout(geoTimeoutRef.current)
      geoTimeoutRef.current = null
    }
  }, [])

  const fetchLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Trinh duyet khong ho tro geolocation.')
      return
    }

    clearGeoTracking()
    setIsPickingLocation(false)
    setLocationLoading(true)
    setLocationError('')

    let bestSample: { lat: number; long: number; accuracy: number } | null =
      null
    let sampleCount = 0

    const finish = (withSuccess: boolean) => {
      clearGeoTracking()
      setLocationLoading(false)

      const resolvedSample = bestSample

      if (withSuccess && resolvedSample) {
        setCoords({
          lat: Number(resolvedSample.lat.toFixed(6)),
          long: Number(resolvedSample.long.toFixed(6)),
        })
        setViewState((prev) => ({
          ...prev,
          latitude: Number(resolvedSample.lat.toFixed(6)),
          longitude: Number(resolvedSample.long.toFixed(6)),
          zoom: Math.max(prev.zoom, 14),
          bearing: 0,
          pitch: 0,
        }))
        setLocationAccuracyM(Math.round(resolvedSample.accuracy))
        return
      }

      setLocationError(
        'Không thể lấy vị trí chính xác. Hãy bật GPS/chế độ định vị chính xác rồi thử lại.'
      )
    }

    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        sampleCount += 1

        const sample = {
          lat: position.coords.latitude,
          long: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }

        if (!bestSample || sample.accuracy < bestSample.accuracy) {
          bestSample = sample
        }

        if (sample.accuracy <= 25 || sampleCount >= 3) {
          finish(true)
        }
      },
      () => {
        finish(Boolean(bestSample))
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    )

    geoTimeoutRef.current = window.setTimeout(() => {
      finish(Boolean(bestSample))
    }, 9000)
  }, [clearGeoTracking])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchLocation()
    }, 0)

    return () => {
      window.clearTimeout(timer)
      clearGeoTracking()
    }
  }, [clearGeoTracking, fetchLocation])

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
      refetchOwnReports()
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      const apiMessage =
        error.response?.data?.message ||
        'Gui bao cao that bai. Vui long thu lai.'
      messageApi.error(apiMessage)
    },
  })

  const cards = useMemo(() => data?.items || [], [data])

  const {
    data: ownReports,
    isLoading: ownReportsLoading,
    refetch: refetchOwnReports,
  } = useQuery({
    queryKey: ['my-citizen-reports'],
    enabled: Boolean(isSignedIn),
    queryFn: async () => {
      const response = await userApi.getMyReports()
      return response.data?.items ?? []
    },
  })

  const ownReportStats = useMemo(() => {
    const source = ownReports ?? []
    const pending = source.filter((item) => item.status === 'PENDING').length
    const approved = source.filter((item) => item.status === 'APPROVED').length
    const rejected = source.filter((item) => item.status === 'REJECTED').length
    return {
      total: source.length,
      pending,
      approved,
      rejected,
    }
  }, [ownReports])

  const handleMapCoordinatePick = useCallback(
    (evt: MapLayerMouseEvent) => {
      if (!isPickingLocation) {
        return
      }

      const nextLat = Number(evt.lngLat.lat.toFixed(6))
      const nextLong = Number(evt.lngLat.lng.toFixed(6))

      setCoords({ lat: nextLat, long: nextLong })
      setViewState((prev) => ({
        ...prev,
        latitude: nextLat,
        longitude: nextLong,
        zoom: Math.max(prev.zoom, 15),
        bearing: 0,
        pitch: 0,
      }))
      setLocationAccuracyM(null)
      setLocationError('')
      setIsPickingLocation(false)
      messageApi.success('Da cap nhat vi tri theo toa do ban chon tren ban do.')
    },
    [isPickingLocation, messageApi]
  )

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
          <Card
            style={{
              marginBottom: 12,
              background:
                'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(56,189,248,0.08) 100%)',
              border: '1px solid rgba(22,119,255,0.18)',
            }}
          >
            <Space
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              wrap
            >
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  Tin tức giao thông quanh bạn
                </Typography.Title>
                <Typography.Text type="secondary">
                  Cập nhật sự cố theo vị trí hiện tại và theo dõi trạng thái các
                  báo cáo bạn đã gửi.
                </Typography.Text>
              </div>
              <Button
                icon={<ReloadOutlined />}
                size="large"
                loading={isFetching}
                onClick={() => {
                  refetch()
                  refetchOwnReports()
                }}
              >
                Làm mới
              </Button>
            </Space>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Typography.Text type="secondary">
                Vị trí hiện tại
              </Typography.Text>

              {coords ? (
                <Space wrap>
                  <Tag icon={<EnvironmentOutlined />} color="blue">
                    Vĩ độ: {coords.lat}
                  </Tag>
                  <Tag icon={<EnvironmentOutlined />} color="geekblue">
                    Kinh độ: {coords.long}
                  </Tag>
                  {locationAccuracyM !== null ? (
                    <Tag color="processing">Sai số: ~{locationAccuracyM} m</Tag>
                  ) : null}
                </Space>
              ) : null}

              <Space wrap style={{ width: '100%' }}>
                <Card size="small" style={{ minWidth: 140 }}>
                  <Statistic title="Sự cố quanh bạn" value={cards.length} />
                </Card>
                <Card size="small" style={{ minWidth: 140 }}>
                  <Statistic
                    title="Báo cáo của bạn"
                    value={ownReportStats.total}
                  />
                </Card>
                <Card size="small" style={{ minWidth: 140 }}>
                  <Statistic title="Chờ duyệt" value={ownReportStats.pending} />
                </Card>
              </Space>

              {locationError ? (
                <Alert type="warning" message={locationError} />
              ) : null}

              {isPickingLocation ? (
                <Alert
                  type="info"
                  message="Đang chọn lại tọa độ"
                  description="Nhấn vào vị trí chính xác trên bản đồ bên phải để cập nhật."
                  showIcon
                />
              ) : null}

              <Space wrap>
                <Button
                  size="large"
                  onClick={fetchLocation}
                  loading={locationLoading}
                >
                  Lấy lại vị trí
                </Button>
                <Button
                  size="large"
                  type={isPickingLocation ? 'primary' : 'default'}
                  onClick={() => setIsPickingLocation((prev) => !prev)}
                >
                  {isPickingLocation
                    ? 'Hủy chọn tọa độ'
                    : 'Chọn lại tọa độ trên bản đồ'}
                </Button>
              </Space>
            </Space>
          </Card>

          <Card bodyStyle={{ padding: 8 }}>
            <Tabs
              activeKey={activeLeftTab}
              onChange={(value) => setActiveLeftTab(value as 'feed' | 'mine')}
              items={[
                {
                  key: 'feed',
                  label: 'Sự cố quanh bạn',
                  children: (
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
                                    <Tag>
                                      {incidentTypeLabel(item.incidentType)}
                                    </Tag>
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
                  ),
                },
                {
                  key: 'mine',
                  label: 'Báo cáo của tôi',
                  children: (
                    <List
                      loading={ownReportsLoading}
                      dataSource={ownReports || []}
                      locale={{
                        emptyText: (
                          <Empty description="Bạn chưa gửi báo cáo sự cố nào" />
                        ),
                      }}
                      renderItem={(item: CitizenReportItem) => (
                        <List.Item key={item.reportId} style={{ padding: 8 }}>
                          <Card
                            style={{ width: '100%' }}
                            bodyStyle={{ padding: 12 }}
                            size="small"
                          >
                            <Space style={{ width: '100%' }} align="start">
                              <div style={{ marginTop: 2 }}>
                                {item.status === 'APPROVED' ? (
                                  <CheckCircleOutlined
                                    style={{ color: '#16a34a', fontSize: 18 }}
                                  />
                                ) : item.status === 'REJECTED' ? (
                                  <StopOutlined
                                    style={{ color: '#dc2626', fontSize: 18 }}
                                  />
                                ) : (
                                  <ClockCircleOutlined
                                    style={{ color: '#d97706', fontSize: 18 }}
                                  />
                                )}
                              </div>
                              <div style={{ flex: 1 }}>
                                <Typography.Text strong>
                                  {item.roadName}
                                </Typography.Text>
                                <div>
                                  <Tag>
                                    {incidentTypeLabel(item.incidentType)}
                                  </Tag>
                                  <Tag color={reportStatusColor(item.status)}>
                                    {reportStatusLabel(item.status)}
                                  </Tag>
                                  <Tag color="default">
                                    {dayjs(item.occurredAt).format(
                                      'DD/MM/YYYY HH:mm'
                                    )}
                                  </Tag>
                                </div>
                                {item.description ? (
                                  <Typography.Text type="secondary">
                                    {item.description}
                                  </Typography.Text>
                                ) : null}
                                {item.moderationNote ? (
                                  <Alert
                                    style={{ marginTop: 8 }}
                                    type={
                                      item.status === 'REJECTED'
                                        ? 'error'
                                        : 'success'
                                    }
                                    message={item.moderationNote}
                                    showIcon
                                  />
                                ) : null}
                              </div>
                            </Space>

                            {item.imageUrl ? (
                              <div style={{ marginTop: 10 }}>
                                <Image
                                  src={item.imageUrl}
                                  alt="report"
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
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
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
            onMove={(evt: ViewStateChangeEvent) => setViewState(evt.viewState)}
            onClick={handleMapCoordinatePick}
            mapboxAccessToken={mapboxToken}
            mapStyle={mapStyle}
            style={{
              width: '100%',
              height: '100%',
              cursor: isPickingLocation ? 'crosshair' : 'default',
            }}
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
                    color: isPickingLocation ? '#1677ff' : '#ef4444',
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
              label="Vi do"
              rules={[{ required: true, message: 'Vui lòng nhập vi do' }]}
            >
              <Input size="large" />
            </Form.Item>
            <Form.Item
              style={{ flex: 1 }}
              name="long"
              label="Kinh do"
              rules={[{ required: true, message: 'Vui lòng nhập kinh do' }]}
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
