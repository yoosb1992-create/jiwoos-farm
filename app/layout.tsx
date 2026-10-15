import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "지우네 농장 0.4",
  description: "모바일 플레이와 맵 편집을 지원하는 따뜻한 웹 농장 게임",
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
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
