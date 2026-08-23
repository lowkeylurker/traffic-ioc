'use client';

import { Clock, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const MOCK_NEWS = [
  {
    id: '1',
    type: 'ACCIDENT',
    title: 'Va chạm giao thông tại Ngã tư Hàng Xanh',
    road: 'Đường Điện Biên Phủ, Quận Bình Thạnh',
    time: '5 phút trước',
    status: 'VERIFIED',
    description:
      'Va chạm nhẹ giữa 2 ô tô con hướng về Cầu Sài Gòn, các phương tiện di chuyển chậm.',
  },
  {
    id: '2',
    type: 'FLOOD',
    title: 'Ngập nước do triều cường',
    road: 'Đường Trần Xuân Soạn, Quận 7',
    time: '18 phút trước',
    status: 'VERIFIED',
    description:
      'Mực nước ngập sâu khoảng 20-30cm đoạn gần cầu Rạch Ông, xe máy gặp khó khăn khi lưu thông.',
  },
  {
    id: '3',
    type: 'CONGESTION',
    title: 'Mật độ phương tiện tăng cao',
    road: 'Đường Cộng Hòa, Quận Tân Bình',
    time: '30 phút trước',
    status: 'VERIFIED',
    description:
      'Lượng xe đông hướng từ cầu vượt Hoàng Hoa Thám về Lăng Cha Cả, tốc độ di chuyển trung bình 15km/h.',
  },
];

export default function NewsPage() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bản Tin Giao Thông Trực Tuyến</h1>
          <p className="text-xs text-slate-500">
            Cập nhật sự cố và tình hình lưu thông thời gian thực
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      <div className="space-y-4">
        {MOCK_NEWS.map((item) => (
          <Card key={item.id} className="flex flex-col gap-3 p-5 transition hover:border-slate-300">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    item.type === 'ACCIDENT'
                      ? 'destructive'
                      : item.type === 'FLOOD'
                        ? 'default'
                        : 'warning'
                  }
                >
                  {item.type === 'ACCIDENT'
                    ? 'Tai nạn'
                    : item.type === 'FLOOD'
                      ? 'Ngập nước'
                      : 'Ùn ứ'}
                </Badge>
                <Badge variant="success" className="gap-1 text-[11px]">
                  <ShieldCheck className="h-3 w-3" />
                  Đã xác thực
                </Badge>
              </div>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {item.time}
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-900">{item.title}</h2>
            <p className="text-sm text-slate-600">{item.description}</p>

            <div className="flex items-center gap-1 border-t border-slate-100 pt-2 text-xs font-medium text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {item.road}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
