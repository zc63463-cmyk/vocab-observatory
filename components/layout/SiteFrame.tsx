import { SiteHeader } from "@/components/layout/SiteHeader";

export function SiteFrame({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </>
  );
}
