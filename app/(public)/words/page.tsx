import { WordsSearchShell } from "@/components/words/WordsSearchShell";
import { getPublicWords } from "@/lib/words";

export const dynamic = "force-static";
export const revalidate = 300;

export default async function WordsPage() {
  const result = await getPublicWords();

  return <WordsSearchShell initialResult={result} />;
}
