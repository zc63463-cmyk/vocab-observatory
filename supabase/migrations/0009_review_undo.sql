-- Phase 2: Support undo of the most recent review rating
-- Adds snapshot + undone tracking to review_logs

-- 1. Store the full progress state before this rating was applied
alter table public.review_logs
  add column if not exists previous_progress_snapshot jsonb;

-- 2. Whether this log entry has been undone
alter table public.review_logs
  add column if not exists undone boolean not null default false;

-- 3. When it was undone (audit trail)
alter table public.review_logs
  add column if not exists undone_at timestamptz;

-- 4. Direct FK to progress row for fast lookup
alter table public.review_logs
  add column if not exists progress_id uuid
    references public.user_word_progress(id) on delete set null;

-- 5. Index: find the latest non-undone log for a given progress row
create index if not exists idx_review_logs_progress_undone
  on public.review_logs (progress_id, reviewed_at desc)
  where undone = false;
