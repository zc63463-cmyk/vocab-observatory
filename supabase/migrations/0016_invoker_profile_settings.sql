-- Switch upsert_profile_review_setting from SECURITY DEFINER to SECURITY INVOKER.
--
-- Why this is safe:
--   profiles already has an RLS policy `profiles_update_own` (0002_rls.sql)
--   that allows UPDATE only when auth.uid() = id. With SECURITY INVOKER the
--   function runs under the caller's role, so the existing RLS is what gates
--   row-level access. The explicit auth.uid() = p_user_id guard is kept for
--   a clearer error message; functionally redundant with RLS.
--
-- Why this matters:
--   Advisor finding 0029 (authenticated_security_definer_function_executable)
--   only fires for SECURITY DEFINER functions. Switching to INVOKER both
--   silences the warning and removes the "if a bug ever lets a foreign
--   p_user_id slip past the guard, the DEFINER bypass would leak privilege"
--   tail risk. INVOKER cannot escalate.

CREATE OR REPLACE FUNCTION public.upsert_profile_review_setting(
  p_user_id uuid,
  p_key text,
  p_value jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_caller uuid;
BEGIN
  -- First-line check kept for ergonomics: gives a clear error rather than
  -- letting RLS silently filter the UPDATE to zero rows. Functionally the
  -- profiles_update_own RLS policy enforces the same constraint.
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
    -- Should be unreachable in the happy path: the guard above ensures
    -- we always update the caller's own row, and that row is created
    -- by handle_new_user on signup. If we still see NULL here, something
    -- is genuinely wrong (e.g. profile row was deleted out of band).
    RAISE EXCEPTION 'upsert_profile_review_setting: profile % not found', p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.upsert_profile_review_setting(uuid, text, jsonb, timestamptz) IS
  'Atomically set or clear a key inside profiles.settings.review using jsonb_set. '
  'Runs as SECURITY INVOKER; the existing profiles_update_own RLS policy enforces '
  'caller = target. The auth.uid() guard inside is for ergonomic error messages. '
  'Returns the resulting settings jsonb.';

-- The REVOKE FROM anon set in 0014 still applies; nothing to redo here.
