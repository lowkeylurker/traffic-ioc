import React from 'react';
import { useNotificationStore, NotificationItem } from '@/stores/useNotificationStore';
import { Card, List, Button, Typography, Badge, Space, Spin, Empty } from 'antd';
import { 
  BellOutlined, 
  CheckOutlined, 
  MailOutlined, 
  ClockCircleOutlined,
  DownloadOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export const NotificationsPage: React.FC = () => {
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead 
  } = useNotificationStore();

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 20 
      }}>
        <Space size={12}>
          <BellOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <Title level={3} style={{ margin: 0 }}>Thông báo của tôi</Title>
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
        {unreadCount > 0 && (
          <Button 
            type="primary" 
            ghost 
            icon={<CheckOutlined />} 
            onClick={() => markAllAsRead()}
          >
            Đọc tất cả
          </Button>
        )}
      </div>

      <Card 
        bordered={false} 
        style={{ 
          borderRadius: 12, 
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Spin spinning={loading}>
          <List
            itemLayout="horizontal"
            dataSource={notifications}
            locale={{ emptyText: <Empty description="Bạn chưa có thông báo nào" style={{ padding: '40px 0' }} /> }}
            renderItem={(item: NotificationItem) => {
              const downloadUrl = item.downloadUrl || item.emailPreviewUrl || null;
              const displayText = item.message;

              return (
                <List.Item
                  onClick={() => !item.read && markAsRead(item.id)}
                  style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: item.read ? 'default' : 'pointer',
                    backgroundColor: item.read ? '#ffffff' : '#f0f7ff',
                    transition: 'background-color 0.3s ease',
                    position: 'relative',
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    backgroundColor: item.read ? 'transparent' : '#1890ff',
                    transition: 'background-color 0.3s',
                  }} />
                  
                  <List.Item.Meta
                    avatar={
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        backgroundColor: item.read ? '#f5f5f5' : '#e6f7ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: item.read ? '#bfbfbf' : '#1890ff',
                        fontSize: 18,
                      }}>
                        <MailOutlined />
                      </div>
                    }
                    title={
                      <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text strong style={{ color: item.read ? '#595959' : '#0c2340', fontSize: 15 }}>
                          {item.title}
                        </Text>
                        {!item.read && (
                          <Badge status="processing" color="#1890ff" />
                        )}
                      </Space>
                    }
                    description={
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        <Text style={{ color: item.read ? '#8c8c8c' : '#262626', fontSize: 14 }}>
                          {displayText}
                        </Text>
                        
                        {downloadUrl && (
                          <div style={{ marginTop: 4, marginBottom: 4 }}>
                            <Button 
                              type="primary" 
                              size="small"
                              icon={<DownloadOutlined />} 
                              href={downloadUrl || undefined} 
                              target="_blank"
                              style={{ borderRadius: 6, fontSize: 12, height: 28 }}
                              onClick={(e) => {
                                // Ngăn click lan ra ngoài làm thay đổi trạng thái đọc
                                e.stopPropagation();
                              }}
                            >
                              Tải báo cáo CSV
                            </Button>
                          </div>
                        )}

                        <Space style={{ color: '#bfbfbf', fontSize: 12 }}>
                          <ClockCircleOutlined />
                          <span>{dayjs(item.createdAt).locale('vi').fromNow()}</span>
                        </Space>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};
