create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  trigger_type text not null,
  repo_owner text,
  repo_name text,
  repo_branch text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  imported_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  soft_deleted_count integer not null default 0,
  tags_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_runs_started_at on public.import_runs (started_at desc);
create index if not exists idx_import_runs_status on public.import_runs (status, started_at desc);

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.import_runs(id) on delete cascade,
  source_path text,
  error_stage text not null,
  error_message text not null,
  raw_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists idx_import_errors_run_id on public.import_errors (run_id, created_at desc);

alter table public.import_runs enable row level security;
alter table public.import_errors enable row level security;
