import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "饭签",
  description: "记录小红书上想去打卡的美食店铺"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
