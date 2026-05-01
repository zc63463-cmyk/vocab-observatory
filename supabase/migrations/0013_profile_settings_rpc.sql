-- Atomic writes into the `review` sub-object of profiles.settings.
--
-- Previously the TS layer did read-modify-write on this column, which lost
-- updates when two callers overlapped (e.g. user retunes desired_retention
-- while training is persisting new fsrs_weights). This RPC performs the
-- merge inside the database via jsonb_set so concurrent writers on
-- different keys no longer clobber each other.
--
-- Contract:
--   - p_value = NULL  → delete settings.review.<p_key>
--   - p_value <> NULL → set settings.review.<p_key> = p_value
-- Returns the resulting settings json so callers can avoid a second round
-- trip. Updates `updated_at` on every call so the existing trigger / audit
-- paths see the write.

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
BEGIN
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
  'Atomically set or clear a key inside profiles.settings.review using jsonb_set. Returns the resulting settings jsonb.';
