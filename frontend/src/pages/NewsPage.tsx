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
import React, { useEffect, useMemo, useState } from 'react'

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
  const [reportForm] = Form.useForm()

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
          'Khong lay duoc vi tri. Ban co the nhap toa do thu cong.'
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
    <div style={{ padding: 12, maxWidth: 720, margin: '0 auto' }}>
      {contextHolder}

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
          Tin tuc giao thong gan ban
        </Typography.Title>
        <Button
          icon={<ReloadOutlined />}
          size="large"
          loading={isFetching}
          onClick={() => refetch()}
        >
          Lam moi
        </Button>
      </Space>

      <Card style={{ marginBottom: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">Vi tri hien tai</Typography.Text>

          {coords ? (
            <Space wrap>
              <Tag icon={<EnvironmentOutlined />} color="blue">
                Lat: {coords.lat}
              </Tag>
              <Tag icon={<EnvironmentOutlined />} color="geekblue">
                Long: {coords.long}
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
            Lay lai vi tri
          </Button>
        </Space>
      </Card>

      <Card bodyStyle={{ padding: 8 }}>
        <List
          loading={isLoading}
          dataSource={cards}
          locale={{
            emptyText: (
              <Empty description="Chua co su co da xac thuc quanh ban" />
            ),
          }}
          renderItem={(item: UserNewsItem) => (
            <List.Item key={item.incidentId} style={{ padding: 8 }}>
              <Card
                style={{ width: '100%' }}
                bodyStyle={{ padding: 12 }}
                size="small"
              >
                <Space style={{ width: '100%' }} align="start">
                  <div style={{ marginTop: 2 }}>
                    {getIncidentIcon(item.incidentType)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Typography.Text strong>{item.roadName}</Typography.Text>
                    <div>
                      <Tag>{item.incidentType}</Tag>
                      <Tag color="default">
                        {dayjs(item.occurredAt).fromNow()}
                      </Tag>
                      <Tag color="purple">{item.distanceKm.toFixed(2)} km</Tag>
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
            </List.Item>
          )}
        />
      </Card>

      <FloatButton
        icon={<PlusOutlined />}
        type="primary"
        tooltip="Bao cao su co"
        onClick={() => {
          if (!coords) {
            messageApi.warning('Can co vi tri de gui bao cao.')
          }
          setReportModalOpen(true)
        }}
        style={{ right: 20, bottom: 20, width: 64, height: 64 }}
      />

      <Modal
        title="Bao cao su co"
        open={isReportModalOpen}
        onCancel={() => {
          if (!submitMutation.isPending) {
            setReportModalOpen(false)
          }
        }}
        onOk={handleReportSubmit}
        okText="Gui bao cao"
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
              message="Ban can dang nhap bang Clerk truoc khi gui bao cao."
            />
          ) : null}

          <Form.Item
            name="incidentType"
            label="Loai su co"
            rules={[{ required: true, message: 'Vui long chon loai su co' }]}
          >
            <Select size="large" options={INCIDENT_OPTIONS} />
          </Form.Item>

          <Space style={{ width: '100%' }} size={12}>
            <Form.Item
              style={{ flex: 1 }}
              name="lat"
              label="Latitude"
              rules={[{ required: true, message: 'Nhap latitude' }]}
            >
              <Input size="large" />
            </Form.Item>
            <Form.Item
              style={{ flex: 1 }}
              name="long"
              label="Longitude"
              rules={[{ required: true, message: 'Nhap longitude' }]}
            >
              <Input size="large" />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="Mo ta ngan (tuy chon)">
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>

          <Form.Item label="Anh minh chung (tuy chon)">
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
                  messageApi.error('Chi ho tro JPEG, PNG, WEBP')
                  return Upload.LIST_IGNORE
                }

                if (file.size > maxImageSizeMb * 1024 * 1024) {
                  messageApi.error(`Anh phai nho hon ${maxImageSizeMb}MB`)
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
                Chon anh
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
