import React from 'react'
import {
  Card,
  Descriptions,
  Button,
  Space,
  Avatar,
  Row,
  Col,
  Divider,
} from 'antd'
import { useUser, useAuth } from '@clerk/clerk-react'
import { EditOutlined, LockOutlined } from '@ant-design/icons'
import { Loading } from '@/components'

export const UserProfilePage: React.FC = () => {
  const { user, isLoaded } = useUser()
  const { signOut } = useAuth()

  if (!isLoaded) {
    return <Loading />
  }

  if (!user) {
    return <div>User not found</div>
  }

  const userRole = (user?.publicMetadata?.role as string) || 'user'

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={24}>
        <Col xs={24} sm={24} md={8} lg={8}>
          <Card style={{ textAlign: 'center' }}>
            <Avatar
              size={120}
              src={user.imageUrl}
              alt={`${user.firstName} ${user.lastName}`}
              style={{ marginBottom: '16px' }}
            />
            <h2 style={{ marginBottom: '8px' }}>
              {user.firstName} {user.lastName}
            </h2>
            <p style={{ color: 'rgba(0,0,0,0.65)', marginBottom: '16px' }}>
              @{user.username || 'user'}
            </p>
            <Space>
              <Button icon={<EditOutlined />}>Chỉnh sửa</Button>
              <Button icon={<LockOutlined />}>Đổi mật khẩu</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={24} md={16} lg={16}>
          <Card title="Thông tin cá nhân">
            <Descriptions column={1} bordered>
              <Descriptions.Item label="Tên">
                {user.firstName} {user.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {user.primaryEmailAddress?.emailAddress || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">
                {user.primaryPhoneNumber?.phoneNumber || 'Chưa cập nhật'}
              </Descriptions.Item>
              <Descriptions.Item label="Vai trò">
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    backgroundColor:
                      userRole === 'admin' ? '#ff7875' : '#87d068',
                    color: '#fff',
                  }}
                >
                  {userRole === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Ngôn ngữ">Tiếng Việt</Descriptions.Item>
            </Descriptions>
          </Card>

          <Divider />

          <Card title="Hoạt động">
            <Descriptions column={1}>
              <Descriptions.Item label="Tài khoản tạo lúc">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Cập nhật lần cuối">
                {user.updatedAt
                  ? new Date(user.updatedAt).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'N/A'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Divider />

          <Space>
            <Button type="primary">Lưu thay đổi</Button>
            <Button
              danger
              onClick={async () => {
                await signOut()
              }}
            >
              Đăng xuất
            </Button>
          </Space>
        </Col>
      </Row>
    </div>
  )
}
