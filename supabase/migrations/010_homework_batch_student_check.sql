-- ============================================================
-- 010_homework_batch_student_check
-- Hardening (B1/B2): create_homework_batch never verified that
-- p_student_id belongs to p_workspace_id (only the item assignments
-- were workspace-scoped). A teacher could create a batch row
-- referencing a student from another workspace. Assert the
-- student-in-workspace invariant, mirroring assign_book_to_student.
--
-- Body is otherwise identical to 005_rpc_functions.sql.
-- ============================================================
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

  -- Ensure the target student belongs to this workspace.
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

    -- Validate assignment → test consistency (same book)
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
