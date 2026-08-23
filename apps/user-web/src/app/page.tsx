import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_MAP_CENTER, LOS_COLORS } from '@traffic-ioc/shared';
import { AlertTriangle, MapPin, Navigation, Radio, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-8">
      {/* Welcome Banner */}
      <Card className="flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center">
        <div>
          <Badge variant="success" className="mb-2 gap-1.5 font-semibold">
            <Radio className="h-3 w-3 animate-pulse" />
            Hệ thống trực tuyến thời gian thực
          </Badge>
          <h2 className="text-2xl font-bold text-slate-900">
            Giám sát & Dẫn đường Giao thông TP.HCM
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Dữ liệu tổng hợp từ cảm biến IoT, camera thông minh và phản ánh công dân.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="destructive" className="gap-2">
            <Link href="/report">
              <AlertTriangle className="h-4 w-4" />
              Báo cáo sự cố
            </Link>
          </Button>
        </div>
      </Card>

      {/* Traffic Level Indicator */}
      <Card className="p-4">
        <h3 className="mb-3 text-xs font-bold tracking-wider text-slate-500 uppercase">
          Mức độ thông thoáng (LOS - Level of Service)
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          {Object.entries(LOS_COLORS).map(([grade, color]) => (
            <div
              key={grade}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2"
            >
              <span
                className="h-4 w-4 flex-shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-semibold text-slate-800">LOS {grade}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Services Grid */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="mb-2 flex items-center gap-3 text-blue-600">
              <Navigation className="h-6 w-6" />
              <CardTitle>Dẫn đường né tắc</CardTitle>
            </div>
            <CardDescription>
              Thuật toán tối ưu tuyến đường tránh kẹt xe và các điểm đang xảy ra tai nạn, ngập nước.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" className="w-full text-blue-700 hover:bg-blue-50">
              <Link href="/report">Báo điểm nghẽn</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="mb-2 flex items-center gap-3 text-amber-600">
              <MapPin className="h-6 w-6" />
              <CardTitle>Điểm nóng ùn ứ</CardTitle>
            </div>
            <CardDescription>
              Theo dõi danh sách các tuyến đường có mật độ phương tiện cao (Tọa độ trung tâm: [
              {DEFAULT_MAP_CENTER.join(', ')}]).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" className="w-full text-amber-800 hover:bg-amber-50">
              <Link href="/news">Xem bản tin nóng</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader>
            <div className="mb-2 flex items-center gap-3 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
              <CardTitle>Đóng góp cộng đồng</CardTitle>
            </div>
            <CardDescription>
              Gửi phản ánh sự cố giao thông kèm hình ảnh vị trí để hỗ trợ cộng đồng lái xe an toàn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              variant="secondary"
              className="w-full text-emerald-800 hover:bg-emerald-50"
            >
              <Link href="/report">Gửi phản ánh ngay</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
