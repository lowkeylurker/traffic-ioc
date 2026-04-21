import { RoadOption } from '@/types'
import {
  Button,
  DatePicker,
  Form,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import React, { useMemo, useState } from 'react'

const { RangePicker } = DatePicker
const { Text } = Typography

export interface HistoryFilterValues {
  dateRange: [Dayjs, Dayjs]
  roadName?: string
  minTrafficIndex?: number
}

interface HistoryFilterBarProps {
  roads: RoadOption[]
  loading?: boolean
  exporting?: boolean
  initialRange: [Dayjs, Dayjs]
  onSearch: (values: HistoryFilterValues) => void
  onExport: (values: HistoryFilterValues) => void
}

export const HistoryFilterBar: React.FC<HistoryFilterBarProps> = ({
  roads,
  loading,
  exporting,
  initialRange,
  onSearch,
  onExport,
}) => {
  const [form] = Form.useForm<HistoryFilterValues>()
  const [calendarRange, setCalendarRange] = useState<
    [Dayjs | null, Dayjs | null]
  >([initialRange[0], initialRange[1]])

  const roadOptions = useMemo(
    () =>
      roads.map((road) => ({
        label: road.roadName,
        value: road.roadName,
      })),
    [roads]
  )

  const disabledDate = (current: Dayjs) => {
    if (!calendarRange[0]) {
      return false
    }
    const diffFromStart = current.diff(calendarRange[0], 'day')
    return diffFromStart > 7 || diffFromStart < -7
  }

  const handleExport = async () => {
    try {
      const values = await form.validateFields()
      onExport(values)
    } catch {
      return
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ dateRange: initialRange }}
      onFinish={onSearch}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text strong>Khoảng thời gian tra cứu (tối đa 7 ngày)</Text>
          <Form.Item
            name="dateRange"
            rules={[
              { required: true, message: 'Vui lòng chọn khoảng thời gian' },
            ]}
          >
            <RangePicker
              style={{ width: '100%' }}
              allowClear={false}
              disabledDate={disabledDate}
              onCalendarChange={(values) =>
                setCalendarRange(values ?? [null, null])
              }
            />
          </Form.Item>
        </Space>

        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Form.Item
              name="roadName"
              label="Tên đường"
              style={{ minWidth: 220 }}
            >
              <Select
                allowClear
                showSearch
                placeholder="Tất cả"
                optionFilterProp="label"
                options={roadOptions}
              />
            </Form.Item>

            <Form.Item
              name="minTrafficIndex"
              label="Traffic Index tối thiểu"
              style={{ minWidth: 220 }}
            >
              <InputNumber
                min={0}
                step={0.1}
                style={{ width: '100%' }}
                placeholder="0.0"
              />
            </Form.Item>
          </Space>

          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              Tra cứu
            </Button>
            <Button onClick={handleExport} loading={exporting}>
              Xuất CSV
            </Button>
          </Space>
        </Space>
      </Space>
    </Form>
  )
}
