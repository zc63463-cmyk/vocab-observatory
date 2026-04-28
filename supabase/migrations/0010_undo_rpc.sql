-- Phase 2 Fix: Atomic Undo via Postgres RPC
-- Consolidates all undo operations into a single atomic transaction

CREATE OR REPLACE FUNCTION public.undo_review_log(
  p_review_log_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  success boolean,
  progress_id uuid,
  word_id uuid,
  error_message text
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
  -- Start transaction (implicit in plpgsql)
  -- All operations below are atomic

  -- 1. Fetch and lock the review_log entry
  SELECT 
    id, user_id, word_id, progress_id, undone, previous_progress_snapshot
  INTO v_log_record
  FROM public.review_logs
  WHERE id = p_review_log_id
  FOR UPDATE;  -- Lock this row to prevent concurrent modification

  -- Check log exists
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

  -- 6. Lock the progress row (FOR UPDATE)
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
  FROM public.review_logs
  WHERE progress_id = v_log_record.progress_id
    AND undone = false
  ORDER BY reviewed_at DESC
  LIMIT 1
  FOR UPDATE;  -- Lock to prevent concurrent inserts

  IF v_latest_log_id IS NULL OR v_latest_log_id != p_review_log_id THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '只能撤销最近一次评分'::text;
    RETURN;
  END IF;

  -- 8. Restore progress from snapshot (full FSRS state rollback)
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

  -- 9. Mark log as undone (with condition to ensure atomicity)
  UPDATE public.review_logs
  SET 
    undone = true,
    undone_at = now()
  WHERE id = p_review_log_id
    AND undone = false;  -- Condition prevents double-undo race

  -- Check affected row
  IF NOT FOUND THEN
    -- This should not happen due to earlier checks, but handle defensively
    RAISE EXCEPTION 'Failed to mark review log as undone (concurrent modification?)';
  END IF;

  -- 10. Atomically decrement session cards_seen
  -- Use COALESCE to handle case where cards_seen might be NULL (shouldn't happen)
  SELECT EXISTS(
    SELECT 1 FROM public.sessions WHERE id = p_session_id
  ) INTO v_session_exists;

  IF v_session_exists THEN
    UPDATE public.sessions
    SET 
      cards_seen = GREATEST(COALESCE(cards_seen, 0) - 1, 0),
      updated_at = now()
    WHERE id = p_session_id;
    -- Note: If session doesn't exist or update fails, we don't fail the undo
    -- because the core undo (progress + log) is what matters
  END IF;

  -- 11. Return success with progress and word IDs
  RETURN QUERY SELECT 
    true, 
    v_log_record.progress_id, 
    v_log_record.word_id,
    NULL::text;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Any exception triggers automatic rollback of all operations
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, SQLERRM::text;
END;
$$;

COMMENT ON FUNCTION public.undo_review_log(uuid, uuid, uuid) IS 
'Atomically undoes a review rating by restoring progress from snapshot, marking log undone, and decrementing session counter. All-or-nothing transaction.';
