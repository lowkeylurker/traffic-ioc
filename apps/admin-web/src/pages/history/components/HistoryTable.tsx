import { HistoryRecord } from '@/types'
import { Table } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import dayjs from 'dayjs'
import React, { useMemo } from 'react'

interface HistoryTableProps {
  data: HistoryRecord[]
  loading?: boolean
  pagination: TablePaginationConfig
  onChange: (pagination: TablePaginationConfig) => void
}

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }
  return Number(value).toFixed(digits)
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  data,
  loading,
  pagination,
  onChange,
}) => {
  const columns = useMemo<ColumnsType<HistoryRecord>>(
    () => [
      {
        title: 'Thời điểm',
        dataIndex: 'timestamp',
        key: 'timestamp',
        render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
      },
      {
        title: 'Tên đường',
        dataIndex: 'roadName',
        key: 'roadName',
        render: (value: string | null) => value ?? 'N/A',
      },
      {
        title: 'Phân đoạn (Segment ID)',
        dataIndex: 'segmentId',
        key: 'segmentId',
      },
      {
        title: 'Lưu lượng (PCU)',
        dataIndex: 'pcuVolume',
        key: 'pcuVolume',
        align: 'right',
        render: (value: number | null) => formatNumber(value),
      },
      {
        title: 'Độ trễ (s)',
        dataIndex: 'delaySeconds',
        key: 'delaySeconds',
        align: 'right',
        render: (value: number | null) => formatNumber(value),
      },
      {
        title: 'Traffic Index',
        dataIndex: 'trafficIndex',
        key: 'trafficIndex',
        align: 'right',
        render: (value: number | null) => formatNumber(value),
      },
    ],
    []
  )

  return (
    <Table<HistoryRecord>
      rowKey={(record) => `${record.timestamp}-${record.segmentId}`}
      columns={columns}
      dataSource={data}
      loading={loading}
      pagination={pagination}
      scroll={{ x: 1100 }}
      onChange={(nextPagination) => onChange(nextPagination)}
    />
  )
}
