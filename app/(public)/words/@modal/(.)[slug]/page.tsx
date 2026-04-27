import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { WordDetailContent, WordDetailFallback } from "../../[slug]/page";

export default function InterceptedWordDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Modal>
      <Suspense fallback={<WordDetailFallback />}>
        <WordDetailContent params={params} />
      </Suspense>
    </Modal>
  );
}
