import { SiteHeader } from "@/components/layout/SiteHeader";
import { PageTransitionMain } from "@/components/motion/PageTransitionMain";

export function SiteFrame({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SiteHeader />
      <PageTransitionMain>{children}</PageTransitionMain>
    </>
  );
}
