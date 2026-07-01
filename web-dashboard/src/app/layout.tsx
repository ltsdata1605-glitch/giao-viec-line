import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

export const metadata: Metadata = {
  title: "Bot LINE Dashboard - Quản lý Bot thông minh",
  description: "Hệ thống quản lý Bot LINE: Giao việc, Theo dõi tương tác, Thư viện từ khóa & Báo cáo hiệu suất nhóm.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
