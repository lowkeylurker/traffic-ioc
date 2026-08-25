import type { Metadata } from 'next';
import { Scale, ShieldAlert, Sparkles } from 'lucide-react';
import { ChatBox } from '@/components/assistant/chat-box';

export const metadata: Metadata = {
  title: 'Trợ lý Pháp lý Giao thông — Smart Traffic IOC',
  description:
    'Hỏi đáp pháp luật giao thông đường bộ Việt Nam, tra cứu mức phạt và quy định theo Nghị định 100/2019/NĐ-CP & Nghị định 123/2021/NĐ-CP',
};

export default function AssistantPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Scale className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                Trợ Lý Pháp Lý Giao Thông
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                <Sparkles className="h-3 w-3" /> AI Law RAG
              </span>
            </div>
            <p className="text-xs text-slate-500 sm:text-sm">
              Tra cứu nhanh mức xử phạt, điều khoản luật và giải đáp tình huống giao thông theo quy định pháp luật Việt Nam
            </p>
          </div>
        </div>

        {/* Disclaimer Banner */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 shadow-xs">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold text-amber-900">Lưu ý quan trọng: </span>
              Thông tin do Trợ lý AI cung cấp chỉ mang tính chất tham khảo dựa trên Nghị định 100/2019/NĐ-CP, Nghị định 123/2021/NĐ-CP và Luật Giao thông đường bộ hiện hành. Kết quả tra cứu không thay thế quyết định xử phạt vi phạm hành chính hoặc tư vấn pháp lý chính thức của cơ quan có thẩm quyền.
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Chat Box */}
      <div className="flex flex-1 flex-col min-h-[580px]">
        <ChatBox />
      </div>
    </div>
  );
}
