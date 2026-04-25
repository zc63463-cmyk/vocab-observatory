import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { GlobalAuthCodeHandler } from "@/components/auth/GlobalAuthCodeHandler";

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
});

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "词汇知识库",
  description: "基于 Obsidian、Supabase 与 Vercel 的词汇知识库与复习系统。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--color-canvas)] text-[var(--color-ink)]">
        <div className="ambient-bg" />
        <div className="relative flex min-h-screen flex-col">
          <Suspense fallback={null}>
            <GlobalAuthCodeHandler />
          </Suspense>
          {children}
        </div>
      </body>
    </html>
  );
}
