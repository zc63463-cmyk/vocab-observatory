-- Security hardening driven by Supabase Security Advisor findings.
--
-- Fixes applied here (all backwards compatible with existing app code):
--
-- 1. function_search_path_mutable (0011)
--    Pin search_path on handle_updated_at and undo_review_log so a rogue
--    caller cannot hijack function resolution via their own schema.
--
-- 2. anon_security_definer_function_executable (0028)
--    Revoke EXECUTE on handle_new_user from anon/authenticated/PUBLIC. The
--    function is only meant to run as a trigger on auth.users INSERT; the
--    trigger itself continues to fire regardless of REST grants.
--
-- 3. authenticated_security_definer_function_executable (0029)
--    Same revocation as (2) covers both finds for handle_new_user.
--
-- 4. anon_security_definer_function_executable (0028) for
--    upsert_profile_review_setting
--    - Add an auth.uid() = p_user_id guard so even if someone reaches the
--      function they cannot mutate other users' settings.
--    - Revoke EXECUTE from anon + PUBLIC (the app only ever calls this from
--      authenticated server actions bound to the user's JWT).
--
-- INFO-level rls_enabled_no_policy warnings on import_errors / import_runs
-- are intentional: those tables are admin-only (service_role bypasses RLS
-- anyway). No policy is needed. Skipped here.

-- ---------------------------------------------------------------------------
-- 1. Pin search_path on maintenance/utility functions
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.handle_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.undo_review_log(uuid, uuid, uuid)
  SET search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- 2-3. handle_new_user: revoke all non-superuser EXECUTE privileges.
--      The trigger on auth.users continues to fire because triggers run
--      with definer privileges regardless of the grant list.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. upsert_profile_review_setting: add caller = target guard, then revoke
--    anon so unauthenticated REST callers cannot even reach the function.
--    The body is unchanged apart from the guard at the top.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_profile_review_setting(
  p_user_id uuid,
  p_key text,
  p_value jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_caller uuid;
BEGIN
  -- Defence in depth: SECURITY DEFINER bypasses RLS, so we must enforce
  -- ownership explicitly. Without this check any signed-in user could
  -- mutate another user's profile.settings.review by passing a foreign
  -- p_user_id. The app already only ever calls this with the caller's
  -- own id, so this guard should never fire in practice.
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller <> p_user_id THEN
    RAISE EXCEPTION 'upsert_profile_review_setting: permission denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_key IS NULL OR length(p_key) = 0 THEN
    RAISE EXCEPTION 'upsert_profile_review_setting: p_key must be non-empty';
  END IF;

  IF p_value IS NULL THEN
    -- Remove `review.<p_key>` without touching other review keys.
    UPDATE public.profiles
    SET
      settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        '{review}',
        COALESCE(settings->'review', '{}'::jsonb) - p_key,
        true
      ),
      updated_at = p_now
    WHERE id = p_user_id
    RETURNING settings INTO v_result;
  ELSE
    -- Set `review.<p_key> = p_value`, creating the `review` object if missing.
    UPDATE public.profiles
    SET
      settings = jsonb_set(
        COALESCE(settings, '{}'::jsonb),
        ARRAY['review', p_key],
        p_value,
        true
      ),
      updated_at = p_now
    WHERE id = p_user_id
    RETURNING settings INTO v_result;
  END IF;

  IF v_result IS NULL THEN
    -- Profile row missing. Surface as an error so the caller sees it rather
    -- than silently no-op'ing.
    RAISE EXCEPTION 'upsert_profile_review_setting: profile % not found', p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.upsert_profile_review_setting(uuid, text, jsonb, timestamptz) IS
  'Atomically set or clear a key inside profiles.settings.review using jsonb_set. '
  'Enforces caller = p_user_id via auth.uid() to prevent cross-user writes. '
  'Returns the resulting settings jsonb.';

REVOKE EXECUTE ON FUNCTION public.upsert_profile_review_setting(uuid, text, jsonb, timestamptz)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_profile_review_setting(uuid, text, jsonb, timestamptz)
  FROM anon;
-- authenticated intentionally keeps EXECUTE: this is the path the app uses.
