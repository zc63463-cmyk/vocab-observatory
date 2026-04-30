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
  return (
    <Modal activePathPrefix="/words/">
      <Suspense fallback={<WordDetailFallback />}>
        <WordDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </Modal>
  );
}