import path from "node:path";

if (typeof process.loadEnvFile === "function") {
  const envPath = path.resolve(process.cwd(), ".env.local");
  process.loadEnvFile(envPath);
}

async function main() {
  const [{ createAdminSupabaseClient }, { syncGitHubWords }] = await Promise.all([
    import("../lib/supabase/admin"),
    import("../lib/sync/upsertWord"),
  ]);
  const admin = createAdminSupabaseClient();
  const result = await syncGitHubWords(admin, { triggerType: "script" });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
