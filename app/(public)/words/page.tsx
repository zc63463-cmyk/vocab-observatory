import type { Metadata } from "next";
import { WordsSearchShell } from "@/components/words/WordsSearchShell";
import { createPublicWordsShellResponse } from "@/lib/words";

export const dynamic = "force-static";
export const revalidate = 300;

export const metadata: Metadata = {
  description: "搜索和浏览公开词条库，涵盖释义、搭配、语料、同反义词等结构化信息。",
  openGraph: {
    description: "搜索和浏览公开词条库，涵盖释义、搭配、语料、同反义词等结构化信息。",
    title: "公开词条库 - 词汇知识库",
  },
  title: "公开词条库 - 词汇知识库",
};

export default async function WordsPage() {
  const result = createPublicWordsShellResponse();

  return <WordsSearchShell initialResult={result} />;
}
