import { requireOwnerUser } from "@/lib/auth";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOwnerUser();

  return <>{children}</>;
}
