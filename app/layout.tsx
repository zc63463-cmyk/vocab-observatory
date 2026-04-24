import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { GlobalAuthCodeHandler } from "@/components/auth/GlobalAuthCodeHandler";
import { SiteHeader } from "@/components/layout/SiteHeader";

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
          <SiteHeader />
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
