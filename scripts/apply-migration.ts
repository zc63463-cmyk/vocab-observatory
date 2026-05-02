// Apply a single Supabase migration file to a remote Postgres database.
//
// Why this script instead of `supabase db push`:
//   `db push` assumes the remote has a populated `supabase_migrations`
//   tracking table and tries to apply every migration that isn't in it.
//   When the dev project was bootstrapped from a prod schema dump that
//   tracking table is empty, so `db push` re-applies 0001..0017 and errors
//   on `already exists` for every object in the dump. This script just
//   executes one file in one transaction, idempotent if the SQL itself is.
//
// Usage:
//   $env:MIGRATE_URL = "postgresql://postgres.<ref>:<pw>@<host>/postgres"
//   npm run db:apply -- supabase/migrations/0018_foo.sql
//   Remove-Item env:MIGRATE_URL
//
// Safety:
//   * MIGRATE_URL is never logged — only host/port/database are.
//   * SQL runs inside BEGIN/COMMIT, rolled back on any error.
//   * Caller is responsible for rotating the DB password afterwards if
//     the URL was pasted into a chat log.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function redact(url: string) {
  // postgresql://user:password@host:port/db?query
  // → postgresql://user:***@host:port/db
  try {
    const parsed = new URL(url);
    const user = parsed.username || "<no-user>";
    const host = parsed.hostname;
    const port = parsed.port || "5432";
    const db = parsed.pathname.replace(/^\//, "") || "<no-db>";
    return `${parsed.protocol}//${user}:***@${host}:${port}/${db}`;
  } catch {
    return "<unparseable connection string>";
  }
}

async function main() {
  const migrationArg = process.argv[2];
  if (!migrationArg) {
    console.error("Usage: npm run db:apply -- <path-to-migration.sql>");
    console.error("Example: npm run db:apply -- supabase/migrations/0018_foo.sql");
    process.exit(1);
  }

  const url = process.env.MIGRATE_URL;
  if (!url) {
    console.error("MIGRATE_URL env var is required.");
    console.error("Set it with: $env:MIGRATE_URL = \"<connection string>\"");
    console.error("Get the connection string from Supabase Dashboard →");
    console.error("Settings → Database → Connection string → URI.");
    process.exit(1);
  }

  const migrationPath = resolve(migrationArg);
  let sql: string;
  try {
    sql = readFileSync(migrationPath, "utf8");
  } catch (err) {
    console.error(
      `Failed to read migration file: ${migrationPath}`,
      (err as Error).message,
    );
    process.exit(1);
  }

  if (sql.trim().length === 0) {
    console.error(`Migration file is empty: ${migrationPath}`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: url });

  console.log(`→ connecting to ${redact(url)}`);
  await client.connect();

  try {
    console.log(`→ applying ${migrationArg}`);
    console.log(`  (${sql.length} bytes, ${sql.split("\n").length} lines)`);

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    console.log("✓ success (transaction committed)");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // rollback itself can fail if the server already terminated the
      // transaction; we still want the original error to surface
    });
    console.error("❌ migration failed, rolled back");
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
