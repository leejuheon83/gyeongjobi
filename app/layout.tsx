import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "대외경조비 관리시스템",
  description: "대외경조비 신청 및 관리 사내 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
