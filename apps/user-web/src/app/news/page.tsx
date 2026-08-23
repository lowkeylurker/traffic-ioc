import type { UserNewsItem } from '@traffic-ioc/shared';
import { AlertCircle, Clock, MapPin } from 'lucide-react';

export default function NewsPage() {
  const mockNews: UserNewsItem[] = [
    {
      incidentId: 'inc-1',
      incidentType: 'ACCIDENT',
      roadName: 'Đường Cộng Hòa (ngã tư Hoàng Hoa Thám)',
      occurredAt: '10 phút trước',
      imageUrl: null,
      distanceKm: 1.2,
      location: { lat: 10.8012, long: 106.6543 },
    },
    {
      incidentId: 'inc-2',
      incidentType: 'CONSTRUCTION',
      roadName: 'Cầu Rạch Miễu / Điện Biên Phủ',
      occurredAt: '35 phút trước',
      imageUrl: null,
      distanceKm: 3.5,
      location: { lat: 10.7981, long: 106.7022 },
    },
  ];

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8 flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Bản Tin Cảnh Báo Giao Thông</h2>
        <p className="text-sm text-slate-500 mt-1">Cập nhật liên tục các sự cố giao thông trong bán kính xung quanh bạn.</p>
      </div>

      <div className="flex flex-col gap-3">
        {mockNews.map((item) => (
          <article
            key={item.incidentId}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 hover:border-slate-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                <AlertCircle className="w-3.5 h-3.5" />
                {item.incidentType}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {item.occurredAt}
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-900 mt-1">{item.roadName}</h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Cách bạn khoảng {item.distanceKm} km
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
