-- Forecast-vs-actual telemetry table.
--
-- Each row freezes the user's *morning plan* for one day: how many cards we
-- predicted would come due. The "actual" half is computed at read time by
-- counting review_logs joined on the same date — no need to update this row
-- as the day progresses, which keeps the writer side a single idempotent
-- INSERT ... ON CONFLICT DO NOTHING.
--
-- Why a separate table instead of recomputing both axes from current state?
-- Because once a card is reviewed its scheduled due_at jumps forward, so the
-- DB no longer remembers it was ever due *yesterday*. Without snapshots, the
-- forecast curve for past days collapses to ~0 and the comparison is
-- meaningless. We have to record the prediction at the time it was made.

create table if not exists public.daily_forecast_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  forecast_count integer not null check (forecast_count >= 0),
  desired_retention numeric not null,
  captured_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Cheap range scans over recent snapshots for the dashboard chart.
create index if not exists idx_daily_forecast_snapshots_user_date
  on public.daily_forecast_snapshots (user_id, date desc);

alter table public.daily_forecast_snapshots enable row level security;

-- Owner-only access; we never expose this telemetry publicly.
drop policy if exists "daily_forecast_snapshots_own_all"
  on public.daily_forecast_snapshots;

create policy "daily_forecast_snapshots_own_all"
on public.daily_forecast_snapshots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.daily_forecast_snapshots is
  'One snapshot per (user, day) capturing the morning forecast count. Read-only after insert; actuals are joined from review_logs at query time.';
