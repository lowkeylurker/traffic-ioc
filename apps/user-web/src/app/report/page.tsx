import type { IncidentType } from '@traffic-ioc/shared';
import { Camera, MapPin, Send } from 'lucide-react';

export default function ReportPage() {
  const incidentTypes: Array<{ value: IncidentType; label: string }> = [
    { value: 'ACCIDENT', label: 'Tai nạn giao thông' },
    { value: 'FLOOD', label: 'Ngập lụt' },
    { value: 'CONSTRUCTION', label: 'Công trường / Sửa đường' },
    { value: 'FIRE', label: 'Cháy nổ' },
    { value: 'OTHER', label: 'Sự cố khác' },
  ];

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full p-4 md:p-8 flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Gửi Báo Cáo Sự Cố Giao Thông</h2>
        <p className="text-sm text-slate-500 mb-6">
          Thông tin phản ánh của bạn sẽ được gửi về trung tâm điều hành IOC để xác minh và thông báo cho người tham gia giao thông.
        </p>

        <form className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Loại sự cố</label>
            <select className="w-full p-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {incidentTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tuyến đường / Vị trí</label>
            <div className="relative">
              <input
                type="text"
                placeholder="VD: Đường Nguyễn Thị Minh Khai, Quận 1"
                className="w-full p-2.5 pl-9 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mô tả chi tiết</label>
            <textarea
              rows={3}
              placeholder="Mô tả mức độ tắc nghẽn, hướng đi ảnh hưởng..."
              className="w-full p-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Hình ảnh đính kèm</label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50 transition">
              <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1" />
              <span className="text-xs text-slate-500">Chạm để chụp hoặc chọn ảnh từ máy</span>
            </div>
          </div>

          <button
            type="button"
            className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 shadow transition"
          >
            <Send className="w-4 h-4" />
            Gửi phản ánh
          </button>
        </form>
      </div>
    </div>
  );
}
