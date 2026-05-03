import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { GlobalAuthCodeHandler } from "@/components/auth/GlobalAuthCodeHandler";
import { GlobalErrorBoundary } from "@/components/layout/GlobalErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import { ReducedMotionProvider } from "@/components/motion/ReducedMotionProvider";
import { OmniPalette } from "@/components/omni";
import { OmniProvider } from "@/components/omni/useOmniStore";

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

/**
 * Inline script to prevent FOUC (Flash of Unstyled Content) on dark mode.
 * Runs before React hydrates so the correct data-theme attribute is set instantly.
 */
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    var resolved = 'light';
    if (t === 'dark' || t === 'system') {
      resolved = t === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch(e){}
})();
`;

export const metadata: Metadata = {
  title: "词汇知识库",
  description: "基于 Obsidian、Supabase 与 Vercel 的词汇知识库与复习系统。",
};

// viewport-fit=cover is required for `env(safe-area-inset-*)` to
// actually resolve to non-zero on iOS notch devices and newer Android
// browsers — without it, the Zen-mode FAB sits under the home indicator
// / browser chrome bar even though we `max()` against a 20px fallback.
// The Next.js 16 `viewport` export is the supported way to emit the
// corresponding `<meta name="viewport" content="... viewport-fit=cover">`.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      suppressHydrationWarning
      className={`${headingFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-[var(--color-canvas)] text-[var(--color-ink)]">
        <div className="ambient-bg" />
        <ReducedMotionProvider>
          <ToastProvider>
            <GlobalErrorBoundary>
              <OmniProvider>
                <div className="relative flex min-h-screen flex-col">
                  <Suspense fallback={null}>
                    <GlobalAuthCodeHandler />
                  </Suspense>
                  {children}
                </div>
                <OmniPalette />
              </OmniProvider>
            </GlobalErrorBoundary>
          </ToastProvider>
        </ReducedMotionProvider>
      </body>
    </html>
  );
}
