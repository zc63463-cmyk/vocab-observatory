import { WordsSearchShell } from "@/components/words/WordsSearchShell";
import { getPublicWords } from "@/lib/words";

export default async function WordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    freq?: string;
    q?: string;
    review?: "all" | "tracked" | "due" | "untracked";
    semantic?: string;
  }>;
}) {
  const { freq, q, review, semantic } = await searchParams;
  const result = await getPublicWords({ freq, q, review, semantic });

  return <WordsSearchShell initialResult={result} />;
}
