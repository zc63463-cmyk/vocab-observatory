import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { WordDetailContent, WordDetailFallback } from "@/app/(public)/words/[slug]/page";

export default function InterceptedWordDetailFromApp({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    freq?: string | string[];
    q?: string | string[];
    review?: string | string[];
    semantic?: string | string[];
  }>;
}) {
  // Inside the modal there is no SiteHeader above the content scroll
  // container — the modal itself starts at top:5rem. Override the TOC
  // sticky offset to 0 so the chip bar pins to the top of the modal's
  // scroll viewport instead of leaving a phantom 5rem gap.
  return (
    <Modal activePathPrefix="/words/">
      <div style={{ "--toc-sticky-top": "0px" } as React.CSSProperties}>
        <Suspense fallback={<WordDetailFallback />}>
          <WordDetailContent params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </Modal>
  );
}