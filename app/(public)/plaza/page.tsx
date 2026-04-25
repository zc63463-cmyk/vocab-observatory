import { PlazaSearchShell } from "@/components/plaza/PlazaSearchShell";
import { getPlazaOverview, type PlazaFilterKind } from "@/lib/plaza";

export default async function PlazaPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: PlazaFilterKind;
    q?: string;
  }>;
}) {
  const { kind, q } = await searchParams;
  const result = await getPlazaOverview({ kind, q });

  return <PlazaSearchShell initialResult={result} />;
}
