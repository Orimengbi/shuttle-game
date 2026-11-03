import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_SC({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "南方月赛赛程",
  description: "男单、男双全循环，混双分组循环加淘汰。没有连打，胜场相同先看交手，套圈看总净胜分。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${noto.variable} antialiased`}>{children}</body>
    </html>
  );
}
