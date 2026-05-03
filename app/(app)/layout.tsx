import { requireOwnerUser } from "@/lib/auth";
import { SiteFrame } from "@/components/layout/SiteFrame";
import { ReviewPreferencesProvider } from "@/components/review/ReviewPreferencesProvider";

export default async function ProtectedAppLayout({
  children,
  modal,
}: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  await requireOwnerUser();

  return (
    // ReviewPreferencesProvider wraps the protected app shell so
    // /review, /review/zen and /dashboard all share one preferences
    // fetch + one source of truth. Mid-review toggles in the zen
    // popover therefore propagate live to the running session, and
    // the dashboard panel stays in sync without a refetch.
    <ReviewPreferencesProvider>
      <SiteFrame>
        {children}
        {modal}
      </SiteFrame>
    </ReviewPreferencesProvider>
  );
}
