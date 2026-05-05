const defaults = {
  repoOwner: "zc63463-cmyk",
  repoName: "Obsidian-Eg",
  repoBranch: "main",
  // Multiple word directories. Each subdirectory's name (after the `L0_` prefix)
  // maps to a `word_freq` label via `WORD_FREQ_LABEL_MAP` in
  // `lib/sync/parseMarkdown.ts`. Override with the comma-separated env var
  // `OBSIDIAN_WORDS_PREFIXES`.
  wordsPrefixes: [
    "Wiki/L0_超纲词",
    "Wiki/L0_基础词",
    "Wiki/L0_单词集合",
  ],
} as const;

function parsePrefixes(value: string | undefined) {
  if (!value) {
    return null;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ownerEmail: process.env.OWNER_EMAIL?.trim().toLowerCase(),
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  importSecret: process.env.IMPORT_SECRET,
  cronSecret: process.env.CRON_SECRET,
  repoOwner: process.env.OBSIDIAN_REPO_OWNER ?? defaults.repoOwner,
  repoName: process.env.OBSIDIAN_REPO_NAME ?? defaults.repoName,
  repoBranch: process.env.OBSIDIAN_REPO_BRANCH ?? defaults.repoBranch,
  wordsPrefixes:
    parsePrefixes(process.env.OBSIDIAN_WORDS_PREFIXES) ??
    parsePrefixes(process.env.OBSIDIAN_WORDS_PREFIX) ??
    [...defaults.wordsPrefixes],
};

export function hasSupabasePublicEnv() {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}

export function hasSupabaseAdminEnv() {
  return Boolean(
    env.supabaseUrl &&
      env.supabasePublishableKey &&
      env.supabaseServiceRoleKey,
  );
}

export function requireSupabasePublicEnv() {
  if (!hasSupabasePublicEnv()) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url: env.supabaseUrl!,
    key: env.supabasePublishableKey!,
  };
}

export function requireSupabaseAdminEnv() {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return {
    url: env.supabaseUrl!,
    key: env.supabaseServiceRoleKey!,
  };
}
