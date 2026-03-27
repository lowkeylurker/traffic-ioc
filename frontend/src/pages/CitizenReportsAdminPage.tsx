import { userApi } from '@/services/api'
import { CitizenReportItem, CitizenReportStatus } from '@/types'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  Image,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'

const { Title, Text } = Typography

const statusColor: Record<CitizenReportStatus, string> = {
  PENDING: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
}

const statusLabel: Record<CitizenReportStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
}

export const CitizenReportsAdminPage: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage()
  const [statusFilter, setStatusFilter] = useState<CitizenReportStatus | 'ALL'>(
    'PENDING'
  )

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-citizen-reports', statusFilter],
    queryFn: async () => {
      const params =
        statusFilter === 'ALL' ? undefined : { status: statusFilter }
      const response = await userApi.getReportsForAdmin(params)
      return response.data?.items ?? []
    },
  })

  const moderateMutation = useMutation({
    mutationFn: async (payload: {
      reportId: string
      status: 'APPROVED' | 'REJECTED'
    }) => {
      await userApi.moderateReport(payload.reportId, {
        status: payload.status,
      })
    },
    onSuccess: (_, payload) => {
      messageApi.success(
        payload.status === 'APPROVED'
          ? 'Đã duyệt báo cáo thành công'
          : 'Đã từ chối báo cáo'
      )
      refetch()
    },
    onError: () => {
      messageApi.error('Cập nhật trạng thái báo cáo thất bại')
    },
  })

  const rows = useMemo(() => data ?? [], [data])

  const columns: ColumnsType<CitizenReportItem> = [
    {
      title: 'Loại sự cố',
      dataIndex: 'incidentType',
      width: 130,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: 'Tuyến đường',
      dataIndex: 'roadName',
      width: 180,
      ellipsis: true,
    },
    {
      title: 'Người báo cáo',
      dataIndex: 'reporterId',
      width: 200,
      ellipsis: true,
      render: (value: string | undefined) => value || 'N/A',
    },
    {
      title: 'Ảnh',
      dataIndex: 'imageUrl',
      width: 120,
      render: (value: string | null) =>
        value ? (
          <Image
            src={value}
            width={72}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 6 }}
          />
        ) : (
          <Text type="secondary">Không có</Text>
        ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      ellipsis: true,
      render: (value: string | null) => value || 'Không có mô tả',
    },
    {
      title: 'Thời điểm',
      dataIndex: 'occurredAt',
      width: 170,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 120,
      render: (value: CitizenReportStatus) => (
        <Tag color={statusColor[value]}>{statusLabel[value]}</Tag>
      ),
    },
    {
      title: 'Hành động',
      dataIndex: 'reportId',
      fixed: 'right',
      width: 180,
      render: (_: string, record: CitizenReportItem) => {
        if (record.status !== 'PENDING') {
          return <Text type="secondary">Đã xử lý</Text>
        }

        return (
          <Space>
            <Popconfirm
              title="Duyệt báo cáo này?"
              okText="Duyệt"
              cancelText="Huỷ"
              onConfirm={() =>
                moderateMutation.mutate({
                  reportId: record.reportId,
                  status: 'APPROVED',
                })
              }
            >
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                size="small"
                loading={moderateMutation.isPending}
              >
                Duyệt
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Từ chối báo cáo này?"
              okText="Từ chối"
              cancelText="Huỷ"
              onConfirm={() =>
                moderateMutation.mutate({
                  reportId: record.reportId,
                  status: 'REJECTED',
                })
              }
            >
              <Button
                danger
                icon={<CloseCircleOutlined />}
                size="small"
                loading={moderateMutation.isPending}
              >
                Từ chối
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      {contextHolder}
      <Card>
        <Space
          style={{
            width: '100%',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
          wrap
        >
          <div>
            <Title level={4} style={{ marginBottom: 4 }}>
              Quản lý báo cáo sự cố từ người dân
            </Title>
            <Text type="secondary">
              Chỉ khi báo cáo được duyệt mới được ghi nhận vào dữ liệu sự cố vận
              hành.
            </Text>
          </div>

          <Space>
            <Select
              style={{ minWidth: 170 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { label: 'Tất cả', value: 'ALL' },
                { label: 'Chờ duyệt', value: 'PENDING' },
                { label: 'Đã duyệt', value: 'APPROVED' },
                { label: 'Đã từ chối', value: 'REJECTED' },
              ]}
            />
            <Button
              icon={<ReloadOutlined />}
              loading={isFetching}
              onClick={() => refetch()}
            >
              Làm mới
            </Button>
          </Space>
        </Space>

        <Table
          rowKey="reportId"
          loading={isLoading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  )
}
