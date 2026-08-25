import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Smart Traffic IOC — Cổng Thông Tin Giao Thông TP.HCM',
  description:
    'Nền tảng theo dõi tình hình giao thông, bản tin trực tuyến và tiếp nhận phản ánh sự cố từ người dân TP.HCM',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🚦</span>
              <div className="flex flex-col">
                <span className="leading-none font-bold text-slate-900">Traffic IOC</span>
                <span className="text-[10px] font-medium text-slate-500">
                  Cổng Thông Tin Công Dân
                </span>
              </div>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-blue-600"
              >
                Trang chủ
              </Link>
              <Link
                href="/news"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-blue-600"
              >
                Bản tin
              </Link>
              <Link
                href="/assistant"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-blue-600"
              >
                Trợ lý Luật
              </Link>
              <Link
                href="/report"
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-red-700"
              >
                <span>Báo sự cố</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex flex-1 flex-col">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
            <span>© 2026 Smart Traffic IOC — Trung tâm Điều hành Giao thông Thông minh TP.HCM</span>
            <span>Phiên bản Công dân 1.0</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
