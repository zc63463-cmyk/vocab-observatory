-- Phase 2 Hotfix: undo_review_log RPC raised "column reference word_id is ambiguous"
-- Cause: RETURNS TABLE OUT parameters (progress_id, word_id) collided with column names
--        used in WHERE / SELECT clauses inside the function body.
-- Fix:   prefix OUT parameter names with `out_` so they cannot shadow real columns.

CREATE OR REPLACE FUNCTION public.undo_review_log(
  p_review_log_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  out_success boolean,
  out_progress_id uuid,
  out_word_id uuid,
  out_error_message text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_log_record record;
  v_latest_log_id uuid;
  v_snapshot jsonb;
  v_progress_exists boolean;
  v_session_exists boolean;
BEGIN
  -- 1. Fetch and lock the review_log entry
  SELECT 
    id, user_id, word_id, progress_id, undone, previous_progress_snapshot
  INTO v_log_record
  FROM public.review_logs
  WHERE id = p_review_log_id
  FOR UPDATE;

  IF v_log_record IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '找不到该评分记录'::text;
    RETURN;
  END IF;

  -- 2. Verify user ownership
  IF v_log_record.user_id != p_user_id THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '无权撤销此评分'::text;
    RETURN;
  END IF;

  -- 3. Check already undone
  IF v_log_record.undone THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '该评分已被撤销'::text;
    RETURN;
  END IF;

  -- 4. Check snapshot exists
  IF v_log_record.previous_progress_snapshot IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '该评分记录不支持撤销（无快照）'::text;
    RETURN;
  END IF;

  -- 5. Check progress_id exists
  IF v_log_record.progress_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '该评分记录缺少进度关联'::text;
    RETURN;
  END IF;

  -- 6. Lock the progress row
  SELECT EXISTS(
    SELECT 1 FROM public.user_word_progress 
    WHERE id = v_log_record.progress_id
    FOR UPDATE
  ) INTO v_progress_exists;

  IF NOT v_progress_exists THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '找不到对应的进度记录'::text;
    RETURN;
  END IF;

  -- 7. Verify this is the most recent non-undone log for this progress
  SELECT id INTO v_latest_log_id
  FROM public.review_logs rl
  WHERE rl.progress_id = v_log_record.progress_id
    AND rl.undone = false
  ORDER BY rl.reviewed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_latest_log_id IS NULL OR v_latest_log_id != p_review_log_id THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '只能撤销最近一次评分'::text;
    RETURN;
  END IF;

  -- 8. Restore progress from snapshot
  v_snapshot := v_log_record.previous_progress_snapshot;

  UPDATE public.user_word_progress
  SET
    scheduler_payload = v_snapshot->'scheduler_payload',
    difficulty = (v_snapshot->>'difficulty')::numeric,
    due_at = (v_snapshot->>'due_at')::timestamptz,
    interval_days = (v_snapshot->>'interval_days')::numeric,
    lapse_count = COALESCE((v_snapshot->>'lapse_count')::integer, 0),
    last_rating = v_snapshot->>'last_rating',
    last_reviewed_at = (v_snapshot->>'last_reviewed_at')::timestamptz,
    retrievability = (v_snapshot->>'retrievability')::numeric,
    review_count = COALESCE((v_snapshot->>'review_count')::integer, 0),
    stability = (v_snapshot->>'stability')::numeric,
    state = v_snapshot->>'state',
    again_count = COALESCE((v_snapshot->>'again_count')::integer, 0),
    hard_count = COALESCE((v_snapshot->>'hard_count')::integer, 0),
    good_count = COALESCE((v_snapshot->>'good_count')::integer, 0),
    easy_count = COALESCE((v_snapshot->>'easy_count')::integer, 0),
    content_hash_snapshot = v_snapshot->>'content_hash_snapshot',
    updated_at = now()
  WHERE id = v_log_record.progress_id;

  -- 9. Mark log as undone
  UPDATE public.review_logs
  SET 
    undone = true,
    undone_at = now()
  WHERE id = p_review_log_id
    AND undone = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to mark review log as undone (concurrent modification?)';
  END IF;

  -- 10. Atomically decrement session cards_seen
  SELECT EXISTS(
    SELECT 1 FROM public.sessions WHERE id = p_session_id
  ) INTO v_session_exists;

  IF v_session_exists THEN
    UPDATE public.sessions
    SET 
      cards_seen = GREATEST(COALESCE(cards_seen, 0) - 1, 0),
      updated_at = now()
    WHERE id = p_session_id;
  END IF;

  -- 11. Return success
  RETURN QUERY SELECT 
    true, 
    v_log_record.progress_id, 
    v_log_record.word_id,
    NULL::text;
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, SQLERRM::text;
END;
$$;

COMMENT ON FUNCTION public.undo_review_log(uuid, uuid, uuid) IS 
'Atomically undoes a review rating. OUT params prefixed with out_ to avoid column-name ambiguity.';
