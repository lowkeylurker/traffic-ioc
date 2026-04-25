import {
  HistoryFilterBar,
  HistoryFilterValues,
} from '@/pages/history/components/HistoryFilterBar'
import { HistoryMiniMap } from '@/pages/history/components/HistoryMiniMap'
import { HistoryTable } from '@/pages/history/components/HistoryTable'
import { HistoryTrendChart } from '@/pages/history/components/HistoryTrendChart'
import { historyApi, mapApi } from '@/services/api'
import { HistoryQueryParams } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { Card, Col, Row, Space, Typography, message } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import React, { useMemo, useState } from 'react'

const { Title, Text } = Typography

const DEFAULT_RANGE: [Dayjs, Dayjs] = [dayjs().subtract(1, 'day'), dayjs()]

const buildQueryParams = (
  values: HistoryFilterValues
): Omit<HistoryQueryParams, 'page' | 'limit'> => ({
  startDateTime: values.dateTimeRange[0].format('YYYY-MM-DDTHH:mm:ss'),
  endDateTime: values.dateTimeRange[1].format('YYYY-MM-DDTHH:mm:ss'),
  roadKey: values.roadKey?.trim() || undefined,
  minTrafficIndex:
    values.minTrafficIndex === undefined ? undefined : values.minTrafficIndex,
})

export const HistoricalQueryPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<
    Omit<HistoryQueryParams, 'page' | 'limit'>
  >({
    startDateTime: DEFAULT_RANGE[0]
      .startOf('hour')
      .format('YYYY-MM-DDTHH:mm:ss'),
    endDateTime: DEFAULT_RANGE[1].startOf('hour').format('YYYY-MM-DDTHH:mm:ss'),
  })
  const [selectedRoadName, setSelectedRoadName] = useState<string | undefined>()
  const [exporting, setExporting] = useState(false)

  const resolveRoadName = (roadKey?: string) =>
    roadsQuery.data?.find((road) => road.roadKey === roadKey)?.roadName

  const roadsQuery = useQuery({
    queryKey: ['history-roads'],
    queryFn: async () => {
      const response = await mapApi.getRoads()
      return response.data ?? []
    },
    staleTime: 60_000,
  })

  const queryParams = useMemo<HistoryQueryParams>(
    () => ({
      page,
      limit: pageSize,
      ...filters,
    }),
    [filters, page, pageSize]
  )

  const historyQuery = useQuery({
    queryKey: ['history-data', queryParams],
    queryFn: async () => {
      const response = await historyApi.getHistory(queryParams)
      return response.data
    },
    placeholderData: (previous) => previous,
  })

  const mapSegmentsQuery = useQuery({
    queryKey: ['history-map-segments'],
    queryFn: async () => {
      const response = await mapApi.getSegments()
      return response.data?.features ?? []
    },
    staleTime: 5 * 60_000,
  })

  const handleSearch = (values: HistoryFilterValues) => {
    const nextFilters = buildQueryParams(values)
    setFilters(nextFilters)
    setSelectedRoadName(resolveRoadName(nextFilters.roadKey))
    setPage(1)
  }

  const handleExport = async (values: HistoryFilterValues) => {
    const params = buildQueryParams(values)
    try {
      setExporting(true)
      const blob = await historyApi.exportHistory(params)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'traffic_report.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      message.error('Không thể xuất CSV. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const tableData = historyQuery.data?.items ?? []
  const totalItems = historyQuery.data?.totalItems ?? 0

  return (
    <div style={{ padding: 16 }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
          <Title level={4} style={{ marginBottom: 4 }}>
            Tra cứu Lịch sử (Historical Query)
          </Title>
          <Text type="secondary">
            Tra cứu dữ liệu giao thông từ bảng Raw Data theo khoảng thời gian
            chính xác đến phút, tối đa 7 ngày.
          </Text>
          <div style={{ marginTop: 16 }}>
            <HistoryFilterBar
              roads={roadsQuery.data ?? []}
              loading={historyQuery.isFetching}
              exporting={exporting}
              initialRange={DEFAULT_RANGE}
              onSearch={handleSearch}
              onExport={handleExport}
              onRoadKeyChange={(roadKey) =>
                setSelectedRoadName(resolveRoadName(roadKey))
              }
            />
          </div>
        </Card>

        <Card title="Trực quan hóa nhanh">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={17}>
              <HistoryTrendChart data={tableData} />
            </Col>
            <Col xs={24} lg={7}>
              <HistoryMiniMap
                features={mapSegmentsQuery.data ?? []}
                selectedRoadName={selectedRoadName}
              />
            </Col>
          </Row>
        </Card>

        <Card>
          <HistoryTable
            data={tableData}
            loading={historyQuery.isFetching}
            pagination={{
              current: page,
              pageSize,
              total: totalItems,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
            }}
            onChange={(pagination) => {
              if (pagination.current) {
                setPage(pagination.current)
              }
              if (pagination.pageSize) {
                setPageSize(pagination.pageSize)
              }
            }}
          />
        </Card>
      </Space>
    </div>
  )
}
