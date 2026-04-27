import type { Metadata } from "next";
import { PlazaSearchShell } from "@/components/plaza/PlazaSearchShell";
import { getPlazaOverview } from "@/lib/plaza";
import { cacheLife } from "next/cache";


export const metadata: Metadata = {
  description: "浏览词根词缀与语义场两类集合型词汇笔记，从组的知识看词汇全貌。",
  openGraph: {
    description: "浏览词根词缀与语义场两类集合型词汇笔记，从组的知识看词汇全貌。",
    title: "词汇广场 - 词汇知识库",
  },
  title: "词汇广场 - 词汇知识库",
};

export default async function PlazaPage() {
  "use cache";
  cacheLife("minutes");
  const result = await getPlazaOverview();

  return <PlazaSearchShell initialResult={result} />;
}
