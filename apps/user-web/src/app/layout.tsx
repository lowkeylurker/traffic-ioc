import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Traffic HCMC — Cổng Thông Tin Giao Thông Công Dân',
  description: 'Theo dõi tình hình giao thông, tra cứu lộ trình và báo cáo sự cố giao thông tại TP. Hồ Chí Minh.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-[#f0f2f5] text-slate-900 antialiased flex flex-col">
        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm px-4 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚦</span>
            <div>
              <h1 className="font-bold text-lg leading-tight text-slate-900">Traffic IOC</h1>
              <p className="text-xs text-slate-500">Cổng Thông Tin Công Dân</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <a href="/" className="text-blue-600 hover:text-blue-700 transition">Bản Đồ</a>
            <a href="/news" className="text-slate-600 hover:text-slate-900 transition">Tin Tức</a>
            <a href="/report" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow transition">
              Báo Cáo Sự Cố
            </a>
          </nav>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
          Smart Traffic IOC © 2026 TP. Hồ Chí Minh. Monorepo Architecture.
        </footer>
      </body>
    </html>
  );
}
