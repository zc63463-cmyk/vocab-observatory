-- Silence the rls_enabled_no_policy advisor INFO on import_runs / import_errors.
--
-- These tables are admin-only: they are written and read exclusively by the
-- service_role-bound admin client in lib/imports.ts. service_role bypasses
-- RLS, so the explicit deny policies below are no-ops for admin code while
-- they document the intent ("no public access") clearly in SQL and stop
-- the linter from flagging the tables.

create policy import_runs_no_public_access
  on public.import_runs
  for all
  to public
  using (false)
  with check (false);

create policy import_errors_no_public_access
  on public.import_errors
  for all
  to public
  using (false)
  with check (false);
