import { requireOwnerUser } from "@/lib/auth";
import { SiteFrame } from "@/components/layout/SiteFrame";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOwnerUser();

  return <SiteFrame>{children}</SiteFrame>;
}
