import { AuthCallbackClient } from "@/components/auth/AuthCallbackClient";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_description?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <AuthCallbackClient
        code={params.code}
        error={params.error}
        errorDescription={params.error_description}
        next={params.next}
      />
    </div>
  );
}
