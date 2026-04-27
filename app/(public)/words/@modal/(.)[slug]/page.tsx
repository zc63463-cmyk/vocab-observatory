import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { WordDetailContent, WordDetailFallback } from "../../[slug]/page";

export default function InterceptedWordDetailPage({
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
