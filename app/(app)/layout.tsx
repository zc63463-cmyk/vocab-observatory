import { requireOwnerUser } from "@/lib/auth";
import { SiteFrame } from "@/components/layout/SiteFrame";

export default async function ProtectedAppLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  await requireOwnerUser();

  return (
    <SiteFrame>
      {children}
      {modal}
    </SiteFrame>
  );
}
