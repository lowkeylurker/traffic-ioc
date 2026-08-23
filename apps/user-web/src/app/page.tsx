import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, LOS_COLORS } from '@traffic-ioc/shared';
import { AlertTriangle, MapPin, Navigation, Radio, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full gap-6">
      {/* Welcome Banner */}
      <section className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold mb-2">
            <Radio className="w-3 h-3 animate-pulse" />
            Hệ thống trực tuyến thời gian thực
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Giám sát & Dẫn đường Giao thông TP.HCM</h2>
          <p className="text-slate-600 text-sm mt-1">
            Dữ liệu tổng hợp từ cảm biến IoT, camera thông minh và phản ánh công dân.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/report"
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow transition"
          >
            <AlertTriangle className="w-4 h-4" />
            Báo cáo sự cố
          </a>
        </div>
      </section>

      {/* Traffic Level Indicator */}
      <section className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Mức độ thông thoáng (LOS - Level of Service)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {Object.entries(LOS_COLORS).map(([grade, color]) => (
            <div key={grade} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold text-slate-800">LOS {grade}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Services Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-blue-600 mb-3">
            <Navigation className="w-6 h-6" />
            <h4 className="font-bold text-slate-900">Dẫn đường né tắc</h4>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Thuật toán tối ưu tuyến đường tránh kẹt xe và các điểm đang xảy ra tai nạn, ngập nước.
          </p>
          <button className="w-full py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition">
            Tìm đường đi
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-amber-600 mb-3">
            <MapPin className="w-6 h-6" />
            <h4 className="font-bold text-slate-900">Điểm nóng ùn ứ</h4>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Theo dõi danh sách các tuyến đường có mật độ phương tiện cao (Tọa độ trung tâm: [{DEFAULT_MAP_CENTER.join(', ')}]).
          </p>
          <a href="/news" className="w-full py-2 text-center bg-amber-50 text-amber-800 rounded-lg text-xs font-semibold hover:bg-amber-100 transition block">
            Xem bản tin nóng
          </a>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-3 text-emerald-600 mb-3">
            <ShieldCheck className="w-6 h-6" />
            <h4 className="font-bold text-slate-900">Đóng góp cộng đồng</h4>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Gửi phản ánh sự cố giao thông kèm hình ảnh vị trí để hỗ trợ cộng đồng lái xe an toàn.
          </p>
          <a href="/report" className="w-full py-2 text-center bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition block">
            Gửi phản ánh ngay
          </a>
        </div>
      </section>
    </div>
  );
}
