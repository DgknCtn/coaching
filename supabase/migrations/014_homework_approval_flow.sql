-- ============================================================
-- 014_homework_approval_flow
-- Ödev tamamlama artık iki adımlı: öğrenci "yaptım" dediğinde ödev
-- doğrudan tamamlanmaz, önce öğretmen onayına düşer (pending_approval).
-- Sadece öğretmen onayı test_completions kaydı oluşturur ve
-- ilerlemeye sayılır. Öğretmen reddederse öğrenci yeniden gönderebilir.
-- ============================================================

-- 1) Status ve denetim kolonları
ALTER TABLE public.homework_items
  DROP CONSTRAINT IF EXISTS homework_items_status_check;

ALTER TABLE public.homework_items
  ADD CONSTRAINT homework_items_status_check
  CHECK (status IN ('pending', 'pending_approval', 'completed', 'cancelled'));

ALTER TABLE public.homework_items
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN submitted_by_profile_id UUID REFERENCES public.profiles(id),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by_profile_id UUID REFERENCES public.profiles(id),
  ADD COLUMN rejected_at TIMESTAMPTZ,
  ADD COLUMN teacher_note TEXT;

-- 2) submit_homework_item_for_approval
-- Öğrenci (veya öğretmen adına) "yaptım" der → pending_approval.
-- test_completions'a YAZMAZ — onay bekleyen bir ödev ilerlemeye sayılmaz.
CREATE OR REPLACE FUNCTION public.submit_homework_item_for_approval(
  p_homework_item_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev kaydı bulunamadı'; END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status = 'pending_approval' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'already_submitted', true);
  END IF;

  IF v_item.status != 'pending' THEN
    RAISE EXCEPTION 'Bu ödev onaya gönderilemez (mevcut durum: %)', v_item.status;
  END IF;

  UPDATE public.homework_items
  SET status = 'pending_approval', submitted_at = NOW(), submitted_by_profile_id = v_profile_id,
      rejected_at = NULL, teacher_note = NULL
  WHERE id = p_homework_item_id;

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'submitted', true);
END;
$$;

-- 3) approve_homework_item
-- Sadece öğretmen/owner. pending_approval → completed + test_completions insert
-- (eski mark_homework_item_completed'daki insert mantığı buraya taşındı).
CREATE OR REPLACE FUNCTION public.approve_homework_item(
  p_homework_item_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev kaydı bulunamadı'; END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status = 'completed' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'already_completed', true);
  END IF;

  IF v_item.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Bu ödev onaylanamaz (mevcut durum: %)', v_item.status;
  END IF;

  UPDATE public.homework_items
  SET status = 'completed', approved_at = NOW(), approved_by_profile_id = v_profile_id,
      completed_at = NOW(), completed_by_profile_id = v_profile_id
  WHERE id = p_homework_item_id;

  INSERT INTO public.test_completions (
    workspace_id, academic_term_id, student_id,
    student_book_assignment_id, book_test_id,
    completed_at, completed_by_profile_id,
    source, source_homework_item_id, status
  ) VALUES (
    v_item.workspace_id,
    v_batch.academic_term_id,
    v_batch.student_id,
    v_item.student_book_assignment_id,
    v_item.book_test_id,
    NOW(),
    v_profile_id,
    'homework',
    p_homework_item_id,
    'active'
  )
  ON CONFLICT DO NOTHING; -- partial unique index handles dedup

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'approved', true);
END;
$$;

-- 4) reject_homework_item
-- Sadece öğretmen/owner. pending_approval → pending (öğrenci yeniden gönderebilir).
CREATE OR REPLACE FUNCTION public.reject_homework_item(
  p_homework_item_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item  public.homework_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev kaydı bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Bu ödev reddedilemez (mevcut durum: %)', v_item.status;
  END IF;

  UPDATE public.homework_items
  SET status = 'pending', rejected_at = NOW(), teacher_note = p_note,
      submitted_at = NULL, submitted_by_profile_id = NULL
  WHERE id = p_homework_item_id;

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'rejected', true);
END;
$$;

-- 5) revert_homework_item_completion
-- 'completed' veya 'pending_approval' durumundan geri alınabilir hale getirildi.
CREATE OR REPLACE FUNCTION public.revert_homework_item_completion(
  p_homework_item_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Homework item not found'; END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status NOT IN ('completed', 'pending_approval') THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'nothing_to_revert', true);
  END IF;

  UPDATE public.homework_items
  SET status = 'pending', completed_at = NULL, completed_by_profile_id = NULL,
      submitted_at = NULL, submitted_by_profile_id = NULL,
      approved_at = NULL, approved_by_profile_id = NULL
  WHERE id = p_homework_item_id;

  -- Only a 'completed' item can have an active test_completion to revert.
  UPDATE public.test_completions
  SET status = 'reverted', reverted_at = NOW(), reverted_by_profile_id = v_profile_id
  WHERE student_book_assignment_id = v_item.student_book_assignment_id
    AND book_test_id = v_item.book_test_id
    AND status = 'active';

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'reverted', true);
END;
$$;

-- 6) mark_homework_item_completed: kept for backward compatibility but
-- redirected to the new submit-for-approval semantics, so any stale
-- caller no longer bypasses teacher approval.
CREATE OR REPLACE FUNCTION public.mark_homework_item_completed(
  p_homework_item_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN public.submit_homework_item_for_approval(p_homework_item_id);
END;
$$;

-- 7) create_homework_batch: widen duplicate-check to include pending_approval
-- (011'de eklenen kontrolün genişletilmiş hali). Body otherwise identical
-- to 011_prevent_duplicate_homework_items.sql.
CREATE OR REPLACE FUNCTION public.create_homework_batch(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_student_id        UUID,
  p_due_date          DATE,
  p_title             TEXT DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_items             JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_batch_id    UUID;
  v_item        JSONB;
  v_sba_id      UUID;
  v_test_id     UUID;
  v_book_id     UUID;
  v_section_id  UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Student does not belong to this workspace';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Homework batch must have at least one item';
  END IF;

  INSERT INTO public.homework_batches (
    workspace_id, academic_term_id, student_id, title, description, due_date, assigned_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_student_id, p_title, p_description, p_due_date, v_profile_id
  ) RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sba_id  := (v_item->>'student_book_assignment_id')::UUID;
    v_test_id := (v_item->>'book_test_id')::UUID;

    SELECT sba.book_id INTO v_book_id
    FROM public.student_book_assignments sba
    WHERE sba.id = v_sba_id AND sba.workspace_id = p_workspace_id;

    IF v_book_id IS NULL THEN
      RAISE EXCEPTION 'Invalid student_book_assignment_id: %', v_sba_id;
    END IF;

    SELECT section_id INTO v_section_id
    FROM public.book_tests
    WHERE id = v_test_id AND book_id = v_book_id AND status = 'active';

    IF v_section_id IS NULL THEN
      RAISE EXCEPTION 'book_test_id % does not belong to the assigned book', v_test_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.homework_items hi
      JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
      WHERE hb.student_id = p_student_id
        AND hi.book_test_id = v_test_id
        AND hi.status IN ('pending', 'pending_approval')
    ) THEN
      RAISE EXCEPTION 'Bu test öğrenciye zaten ödev olarak atanmış (bekleyen bir ödev kaydı var).';
    END IF;

    INSERT INTO public.homework_items (
      workspace_id, homework_batch_id, student_book_assignment_id,
      book_id, section_id, book_test_id
    ) VALUES (
      p_workspace_id, v_batch_id, v_sba_id,
      v_book_id, v_section_id, v_test_id
    );
  END LOOP;

  RETURN jsonb_build_object('homework_batch_id', v_batch_id);
END;
$$;

-- 8) Views: add pending_approval_tests counter. completed_tests stays
-- 'completed'-only (pending_approval never counted as completed) — a
-- student who has submitted everything but isn't yet approved will show
-- fewer completed tests until the teacher approves. Intentional tradeoff.
CREATE OR REPLACE VIEW public.student_weekly_homework_summary_view AS
SELECT
  hb.workspace_id,
  hb.academic_term_id,
  hb.student_id,
  DATE_TRUNC('week', CURRENT_DATE)::DATE              AS week_start,
  (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE AS week_end,
  COUNT(hi.id) FILTER (WHERE hi.status != 'cancelled')
                                                      AS assigned_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'completed')
                                                      AS completed_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'pending')
                                                      AS pending_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'pending_approval')
                                                      AS pending_approval_tests,
  COUNT(hi.id) FILTER (
    WHERE hi.status = 'pending'
      AND hb.due_date < CURRENT_DATE
  )                                                   AS overdue_tests
FROM public.homework_batches hb
JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
WHERE hb.status = 'active'
  AND hb.due_date BETWEEN DATE_TRUNC('week', CURRENT_DATE)::DATE
                      AND (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
GROUP BY hb.workspace_id, hb.academic_term_id, hb.student_id;

-- teacher_student_overview_view is unaffected structurally (it sums
-- student_book_progress_view + reads student_weekly_homework_summary_view
-- by name), but CREATE OR REPLACE it too since it references the view
-- above and we want pending_approval_tests surfaced at this level as well.
CREATE OR REPLACE VIEW public.teacher_student_overview_view AS
WITH weekly AS (
  SELECT * FROM public.student_weekly_homework_summary_view
),
progress AS (
  SELECT
    student_id,
    workspace_id,
    SUM(total_tests)       AS total_tests,
    SUM(completed_tests)   AS completed_tests,
    SUM(remaining_tests)   AS remaining_tests,
    CASE
      WHEN SUM(total_tests) = 0 THEN 0
      ELSE ROUND(SUM(completed_tests)::NUMERIC / SUM(total_tests)::NUMERIC * 100)
    END                    AS completion_percentage,
    COUNT(*)               AS active_book_count
  FROM public.student_book_progress_view
  GROUP BY student_id, workspace_id
)
SELECT
  s.workspace_id,
  s.id                                                  AS student_id,
  s.full_name                                           AS student_full_name,
  s.exam_type,
  s.grade_level,
  s.status                                              AS student_status,
  COALESCE(p.active_book_count, 0)                      AS active_book_count,
  COALESCE(p.total_tests, 0)                            AS total_tests,
  COALESCE(p.completed_tests, 0)                        AS completed_tests,
  COALESCE(p.remaining_tests, 0)                        AS remaining_tests,
  COALESCE(p.completion_percentage, 0)                  AS completion_percentage,
  COALESCE(w.assigned_tests, 0)                         AS current_week_assigned_tests,
  COALESCE(w.completed_tests, 0)                        AS current_week_completed_tests,
  COALESCE(w.pending_approval_tests, 0)                 AS current_week_pending_approval_tests,
  COALESCE(w.overdue_tests, 0)                          AS overdue_tests,
  CASE
    WHEN COALESCE(w.overdue_tests, 0) > 0               THEN 'red'
    WHEN COALESCE(w.assigned_tests, 0) = 0              THEN 'neutral'
    WHEN COALESCE(w.completed_tests, 0) >= COALESCE(w.assigned_tests, 0) THEN 'green'
    ELSE 'yellow'
  END                                                   AS risk_status
FROM public.students s
LEFT JOIN progress p ON p.student_id = s.id AND p.workspace_id = s.workspace_id
LEFT JOIN weekly w   ON w.student_id = s.id AND w.workspace_id = s.workspace_id
WHERE s.status = 'active';
