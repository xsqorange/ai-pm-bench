import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Workbench",
  description: "本地 AI 开发工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}