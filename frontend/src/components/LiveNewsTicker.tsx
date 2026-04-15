import React, { useEffect, useState } from 'react';
import { Space, Typography, Badge } from 'antd';
import { NotificationOutlined } from '@ant-design/icons';
import { newsApi } from '@/services/api';

const { Text } = Typography;

export const LiveNewsTicker: React.FC = () => {
  const [news, setNews] = useState<string>('📡 Đang tổng hợp tín hiệu giao thông toàn thành phố...');

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await newsApi.getTicker();
        if (response.success && response.data?.news) {
          setNews(response.data.news);
        }
      } catch (error) {
        console.error('Failed to fetch live news ticker:', error);
      }
    };

    // Initial fetch
    void fetchNews();

    // Lặp tự động mỗi 1 phút theo yêu cầu
    const interval = setInterval(() => {
      fetchNews();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000, // Nổi lên trên UI Map
        overflow: 'hidden',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* BADGE: Đứng im */}
      <div
        style={{
          backgroundColor: '#cc0000',
          color: '#ffffff',
          fontWeight: 700,
          padding: '0 16px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          zIndex: 2,
          position: 'relative',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontSize: 13
        }}
      >
        <Space>
          <Badge status="processing" color="white" />
          <Text style={{ color: 'inherit', fontWeight: 'inherit', margin: 0 }}>TIN NÓNG</Text>
        </Space>
      </div>

      {/* MARQUEE CONTAINER */}
      <div
        style={{
          flexGrow: 1,
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          paddingLeft: 12
        }}
      >
        {/*
          Vì Antd không hỗ trợ marquee, Tailwind không được thiết lập cụ thể,
          chúng ta dùng HTML5 animation cơ bản qua CSS tiêm thẳng.
        */}
        <style>
          {`
            @keyframes newsMarquee {
              0% { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
            .news-ticker-text {
              display: inline-block;
              white-space: nowrap;
              color: #ffffff;
              font-size: 15px;
              font-weight: 500;
              padding-left: 100%; /* Đảm bảo chạy từ mép ngoài */
              animation: newsMarquee 20s linear infinite;
            }
            .news-ticker-text:hover {
              animation-play-state: paused;
            }
          `}
        </style>
        <div className="news-ticker-text">
          <NotificationOutlined style={{ color: '#faad14', marginRight: 8 }} />
          {news}
        </div>
      </div>
    </div>
  );
};
