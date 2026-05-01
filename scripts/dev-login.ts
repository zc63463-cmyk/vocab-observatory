// Dev-only utility: print a magic-link URL for the given email so we can
// log in without going through SMTP. Useful when the dev Supabase project
// has no custom SMTP configured (default email service is heavily rate
// limited and unreliable for local dev).
//
// Usage:
//   npm run dev:login -- you@example.com
//
// What it does:
//   1. Loads .env.local (admin credentials must point at the dev project).
//   2. Ensures a confirmed auth user exists for the given email.
//   3. Calls auth.admin.generateLink({ type: 'magiclink' }) with a redirect
//      back to http://localhost:3000/auth/callback?next=/dashboard.
//   4. Prints the action_link — paste it into your browser to log in.
//
// Safety: imports `createAdminSupabaseClient` which requires
// SUPABASE_SERVICE_ROLE_KEY. NEVER ship this URL anywhere; it grants
// instant session access to whoever opens it.

import path from "node:path";

if (typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(process.cwd(), ".env.local");
  process.loadEnvFile(envPath);
}

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Usage: npm run dev:login -- <email>");
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = process.argv[3]?.trim() ?? "/dashboard";
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;

  const { createAdminSupabaseClient } = await import("../lib/supabase/admin");
  const admin = createAdminSupabaseClient();

  // Ensure the user exists and is confirmed. createUser is idempotent at the
  // application layer: if the row already exists we get a 422 we can ignore.
  const createResult = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createResult.error) {
    const message = createResult.error.message ?? "";
    const alreadyExists =
      createResult.error.status === 422 ||
      /already (registered|been registered|exists)/i.test(message) ||
      /duplicate/i.test(message);
    if (!alreadyExists) {
      console.error("createUser failed:", createResult.error);
      process.exit(1);
    }
  }

  const linkResult = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo,
    },
  });

  if (linkResult.error) {
    console.error("generateLink failed:", linkResult.error);
    process.exit(1);
  }

  const actionLink = linkResult.data?.properties?.action_link;
  if (!actionLink) {
    console.error("No action_link in response:", linkResult.data);
    process.exit(1);
  }

  console.log("");
  console.log("Magic link for", email);
  console.log("Redirect target:", redirectTo);
  console.log("");
  console.log(actionLink);
  console.log("");
  console.log("Paste the URL above into your browser to log in.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
