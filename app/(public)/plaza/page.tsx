import { PlazaSearchShell } from "@/components/plaza/PlazaSearchShell";
import { getPlazaOverview } from "@/lib/plaza";

export const dynamic = "force-static";
export const revalidate = 300;

export default async function PlazaPage() {
  const result = await getPlazaOverview();

  return <PlazaSearchShell initialResult={result} />;
}
