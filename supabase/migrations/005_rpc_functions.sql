-- ============================================================
-- 005_rpc_functions.sql
-- Business-logic RPC functions (SECURITY DEFINER)
-- Called from Server Actions, never from the client directly.
-- ============================================================

-- ============================================================
-- create_teacher_workspace
-- Called after a new teacher registers.
-- Creates profile → workspace → workspace_member (owner+teacher).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_teacher_workspace(
  p_auth_user_id  UUID,
  p_full_name     TEXT,
  p_email         TEXT,
  p_workspace_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id    UUID;
  v_workspace_id  UUID;
  v_ws_name       TEXT;
BEGIN
  -- Upsert profile
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  v_ws_name := COALESCE(NULLIF(p_workspace_name, ''), p_full_name || ' Workspace');

  -- Create workspace
  INSERT INTO public.workspaces (name, type, owner_profile_id)
  VALUES (v_ws_name, 'individual', v_profile_id)
  RETURNING id INTO v_workspace_id;

  -- Add as owner
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'owner', 'active');

  -- Add as teacher too (same person)
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'teacher', 'active');

  -- Set default workspace
  UPDATE public.profiles
  SET default_workspace_id = v_workspace_id
  WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'profile_id',   v_profile_id,
    'workspace_id', v_workspace_id
  );
END;
$$;

-- ============================================================
-- create_book_with_sections_and_tests
-- Creates a book + all its sections + auto-numbered tests in one call.
-- p_sections: [{"title": "Bölüm 1", "test_count": 6}, ...]
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_book_with_sections_and_tests(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_title             TEXT,
  p_subject           TEXT,
  p_publisher         TEXT DEFAULT NULL,
  p_exam_type         TEXT DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_sections          JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id    UUID;
  v_book_id       UUID;
  v_section       JSONB;
  v_section_id    UUID;
  v_order         INT;
  v_test_count    INT;
  v_total_tests   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  -- Permission check
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Create book
  INSERT INTO public.books (
    workspace_id, academic_term_id, title, subject, publisher, exam_type, description, created_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_title, p_subject, p_publisher, p_exam_type, p_description, v_profile_id
  ) RETURNING id INTO v_book_id;

  -- Create sections and tests
  v_order := 0;
  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections) LOOP
    v_order := v_order + 1;

    INSERT INTO public.book_sections (workspace_id, book_id, title, order_index)
    VALUES (p_workspace_id, v_book_id, v_section->>'title', v_order)
    RETURNING id INTO v_section_id;

    v_test_count := COALESCE((v_section->>'test_count')::INT, 0);
    v_total_tests := v_total_tests + v_test_count;

    FOR i IN 1..v_test_count LOOP
      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
      VALUES (p_workspace_id, v_book_id, v_section_id, i || '. Test', i);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'book_id',     v_book_id,
    'total_tests', v_total_tests,
    'sections',    v_order
  );
END;
$$;

-- ============================================================
-- assign_book_to_student
-- Assigns a book from the pool to a specific student.
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_book_to_student(
  p_workspace_id      UUID,
  p_student_id        UUID,
  p_book_id           UUID,
  p_academic_term_id  UUID,
  p_start_date        DATE DEFAULT NULL,
  p_target_end_date   DATE DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_sba_id      UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Validate book belongs to workspace
  IF NOT EXISTS (SELECT 1 FROM public.books WHERE id = p_book_id AND workspace_id = p_workspace_id AND status = 'active') THEN
    RAISE EXCEPTION 'Book not found or inactive';
  END IF;

  -- Validate student belongs to workspace
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  INSERT INTO public.student_book_assignments (
    workspace_id, academic_term_id, student_id, book_id,
    assigned_by_profile_id, start_date, target_end_date
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_student_id, p_book_id,
    v_profile_id, p_start_date, p_target_end_date
  )
  RETURNING id INTO v_sba_id;

  RETURN jsonb_build_object('student_book_assignment_id', v_sba_id);
END;
$$;

-- ============================================================
-- create_homework_batch
-- Creates an homework batch (group) with multiple test items.
-- p_items: [{"student_book_assignment_id": "...", "book_test_id": "..."}, ...]
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

-- ============================================================
-- mark_homework_item_completed
-- Student or teacher marks a homework item as completed.
-- Also creates a test_completion record.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_homework_item_completed(
  p_homework_item_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id    UUID;
  v_item          public.homework_items%ROWTYPE;
  v_batch         public.homework_batches%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  -- Fetch item
  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Homework item not found'; END IF;

  -- Fetch batch
  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  -- Permission check
  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot complete a cancelled homework item';
  END IF;

  -- Idempotent: already completed
  IF v_item.status = 'completed' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'already_completed', true);
  END IF;

  -- Update homework item
  UPDATE public.homework_items
  SET status = 'completed', completed_at = NOW(), completed_by_profile_id = v_profile_id
  WHERE id = p_homework_item_id;

  -- Upsert test_completion (one active record per assignment+test)
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

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'completed', true);
END;
$$;

-- ============================================================
-- revert_homework_item_completion
-- Undoes a completion mark (student mistake).
-- ============================================================
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

  -- Permission check
  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status != 'completed' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'nothing_to_revert', true);
  END IF;

  -- Revert homework item
  UPDATE public.homework_items
  SET status = 'pending', completed_at = NULL, completed_by_profile_id = NULL
  WHERE id = p_homework_item_id;

  -- Revert the corresponding test_completion
  UPDATE public.test_completions
  SET status = 'reverted', reverted_at = NOW(), reverted_by_profile_id = v_profile_id
  WHERE student_book_assignment_id = v_item.student_book_assignment_id
    AND book_test_id = v_item.book_test_id
    AND status = 'active';

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'reverted', true);
END;
$$;

-- ============================================================
-- accept_invitation
-- Called from the invite acceptance Server Action.
-- Links the new profile to student or parent record.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token_hash  TEXT,
  p_auth_user_id UUID,
  p_full_name    TEXT,
  p_email        TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv             public.invitations%ROWTYPE;
  v_profile_id      UUID;
  v_role            TEXT;
BEGIN
  -- Fetch and validate invitation
  SELECT * INTO v_inv FROM public.invitations
  WHERE token_hash = p_token_hash AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used invitation';
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  v_role := v_inv.role;

  -- Link student profile if role = student
  IF v_role = 'student' AND v_inv.student_id IS NOT NULL THEN
    UPDATE public.students SET profile_id = v_profile_id WHERE id = v_inv.student_id;
  END IF;

  -- Activate parent link if role = parent
  IF v_role = 'parent' AND v_inv.parent_student_link_id IS NOT NULL THEN
    UPDATE public.parent_student_links
    SET parent_profile_id = v_profile_id, status = 'active'
    WHERE id = v_inv.parent_student_link_id;
  END IF;

  -- Add workspace member
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_inv.workspace_id, v_profile_id, v_role, 'active')
  ON CONFLICT (workspace_id, profile_id, role) DO UPDATE
    SET status = 'active', updated_at = NOW();

  -- Set default workspace
  UPDATE public.profiles
  SET default_workspace_id = v_inv.workspace_id
  WHERE id = v_profile_id AND default_workspace_id IS NULL;

  -- Mark invitation accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = NOW(), accepted_by_profile_id = v_profile_id
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'profile_id',    v_profile_id,
    'workspace_id',  v_inv.workspace_id,
    'role',          v_role
  );
END;
$$;
