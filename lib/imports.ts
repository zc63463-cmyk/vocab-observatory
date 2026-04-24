import { env } from "@/lib/env";
import { getAdminSupabaseClientOrNull } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

export interface ImportFileError {
  errorMessage: string;
  errorStage: string;
  rawExcerpt: string | null;
  sourcePath: string | null;
}

export interface ImportRunOverview {
  available: boolean;
  latestRun: Database["public"]["Tables"]["import_runs"]["Row"] | null;
  recentErrors: Database["public"]["Tables"]["import_errors"]["Row"][];
}

type AdminClient = NonNullable<ReturnType<typeof getAdminSupabaseClientOrNull>>;

function isImportRelationMissing(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("import_runs") === true ||
    error.message?.includes("import_errors") === true
  );
}

export async function createImportRun(
  admin: AdminClient,
  triggerType: string,
) {
  const { data, error } = await admin
    .from("import_runs")
    .insert({
      repo_branch: env.repoBranch,
      repo_name: env.repoName,
      repo_owner: env.repoOwner,
      source: "github_archive",
      status: "running",
      summary: {},
      trigger_type: triggerType,
    })
    .select("*")
    .single();

  if (isImportRelationMissing(error)) {
    return null;
  }

  if (error) {
    throw error;
  }

  return data;
}

export async function completeImportRun(
  admin: AdminClient,
  runId: string | null,
  patch: Database["public"]["Tables"]["import_runs"]["Update"],
) {
  if (!runId) {
    return;
  }

  const { error } = await admin
    .from("import_runs")
    .update({
      ...patch,
      finished_at: patch.finished_at ?? new Date().toISOString(),
    })
    .eq("id", runId);

  if (isImportRelationMissing(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function insertImportErrors(
  admin: AdminClient,
  runId: string | null,
  errors: ImportFileError[],
) {
  if (!runId || errors.length === 0) {
    return;
  }

  const rows: Database["public"]["Tables"]["import_errors"]["Insert"][] = errors.map(
    (entry) => ({
      error_message: entry.errorMessage,
      error_stage: entry.errorStage,
      raw_excerpt: entry.rawExcerpt,
      run_id: runId,
      source_path: entry.sourcePath,
    }),
  );

  const { error } = await admin.from("import_errors").insert(rows);

  if (isImportRelationMissing(error)) {
    return;
  }

  if (error) {
    throw error;
  }
}

export async function getLatestImportOverview(): Promise<ImportRunOverview> {
  const admin = getAdminSupabaseClientOrNull();
  if (!admin) {
    return {
      available: false,
      latestRun: null,
      recentErrors: [],
    };
  }

  const { data: latestRun, error: runError } = await admin
    .from("import_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isImportRelationMissing(runError)) {
    return {
      available: false,
      latestRun: null,
      recentErrors: [],
    };
  }

  if (runError) {
    throw runError;
  }

  if (!latestRun) {
    return {
      available: true,
      latestRun: null,
      recentErrors: [],
    };
  }

  const { data: recentErrors, error: errorRowsError } = await admin
    .from("import_errors")
    .select("*")
    .eq("run_id", latestRun.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (isImportRelationMissing(errorRowsError)) {
    return {
      available: false,
      latestRun: null,
      recentErrors: [],
    };
  }

  if (errorRowsError) {
    throw errorRowsError;
  }

  return {
    available: true,
    latestRun,
    recentErrors: recentErrors ?? [],
  };
}
