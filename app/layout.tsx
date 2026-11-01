import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "投資組合風險報酬計算器",
  description: "上傳每日資金水位 CSV，計算 GNQTS Return、Risk 與 Trend Ratio。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
