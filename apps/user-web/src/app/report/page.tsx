'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Send, Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type IncidentType = 'ACCIDENT' | 'FLOOD' | 'CONGESTION';

export default function ReportPage() {
  const [incidentType, setIncidentType] = useState<IncidentType>('ACCIDENT');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('10.7769');
  const [lng, setLng] = useState('106.7009');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 800);
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(6));
          setLng(pos.coords.longitude.toFixed(6));
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
        }
      );
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="flex w-full max-w-md flex-col items-center p-8 text-center">
          <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
          <h2 className="mb-2 text-xl font-bold text-slate-900">Cảm ơn bạn đã gửi phản ánh!</h2>
          <p className="mb-6 text-sm text-slate-600">
            Báo cáo sự cố đã được tiếp nhận và đang chờ đội ngũ điều hành xác thực. Thông tin sẽ
            hiển thị trên bản tin công dân sau khi được duyệt.
          </p>
          <div className="flex w-full gap-3">
            <Button onClick={() => setSubmitted(false)} variant="outline" className="flex-1">
              Gửi phản ánh khác
            </Button>
            <Button asChild className="flex-1">
              <Link href="/">Về trang chủ</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-3 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Báo cáo Sự cố Giao thông</h1>
            <p className="text-xs text-slate-500">
              Đóng góp thông tin sự cố thời gian thực tại TP.HCM
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label className="mb-2 block">Loại sự cố</Label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                {
                  id: 'ACCIDENT' as IncidentType,
                  label: 'Tai nạn',
                  color: 'border-red-500 text-red-600 bg-red-50',
                },
                {
                  id: 'FLOOD' as IncidentType,
                  label: 'Ngập nước',
                  color: 'border-blue-500 text-blue-600 bg-blue-50',
                },
                {
                  id: 'CONGESTION' as IncidentType,
                  label: 'Ùn tắc',
                  color: 'border-amber-500 text-amber-600 bg-amber-50',
                },
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setIncidentType(item.id)}
                  className={`rounded-xl border-2 p-3 text-center text-sm font-semibold transition ${
                    incidentType === item.id
                      ? item.color
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Vị trí (Tọa độ GPS)</Label>
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <MapPin className="h-3.5 w-3.5" />
                Lấy vị trí hiện tại
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-medium text-slate-400">Vĩ độ (Lat)</span>
                <Input type="text" value={lat} onChange={(e) => setLat(e.target.value)} required />
              </div>
              <div>
                <span className="text-[10px] font-medium text-slate-400">Kinh độ (Lng)</span>
                <Input type="text" value={lng} onChange={(e) => setLng(e.target.value)} required />
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Mô tả chi tiết</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Va chạm giữa 2 xe máy tại ngã tư Hàng Xanh hướng về cầu Sài Gòn..."
            />
          </div>

          <div>
            <Label className="mb-2 block">Hình ảnh hiện trường (Tùy chọn)</Label>
            <div className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-6 text-center transition hover:border-slate-300">
              <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              <p className="text-xs font-medium text-slate-600">
                Nhấn để tải lên hoặc chụp ảnh trực tiếp
              </p>
              <p className="mt-1 text-[10px] text-slate-400">Hỗ trợ JPG, PNG, WEBP tối đa 5MB</p>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            variant="destructive"
            className="w-full py-6 text-base font-bold"
          >
            <Send className="h-4 w-4" />
            {loading ? 'Đang gửi phản ánh...' : 'Gửi Báo Cáo Sự Cố'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
