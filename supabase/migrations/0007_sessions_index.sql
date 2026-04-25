-- Sessions table: composite index for dashboard & review session queries
-- Used by: dashboard.ts (active sessions), session.ts (create/resume/complete)
-- Without this, filtering by user_id + mode + ended_at degrades to seq scan as sessions grow
CREATE INDEX IF NOT EXISTS idx_sessions_user_mode_active
  ON public.sessions (user_id, mode, ended_at, started_at DESC);
