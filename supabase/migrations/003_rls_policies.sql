-- ============================================================
-- 003_rls_policies.sql
-- Row Level Security policies for all tables
-- ============================================================

-- Enable RLS on every table
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_terms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_sections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_tests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_book_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_completions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations              ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

-- ============================================================
-- workspaces
-- ============================================================
CREATE POLICY "workspaces_select_member" ON public.workspaces
  FOR SELECT USING (public.is_workspace_member(id));

CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE USING (public.has_workspace_role(id, ARRAY['owner']));

-- ============================================================
-- workspace_members
-- ============================================================
CREATE POLICY "wm_select_member" ON public.workspace_members
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "wm_insert_owner" ON public.workspace_members
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner']));

CREATE POLICY "wm_update_owner" ON public.workspace_members
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner']));

-- ============================================================
-- academic_terms
-- ============================================================
CREATE POLICY "terms_select_member" ON public.academic_terms
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "terms_insert_teacher" ON public.academic_terms
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "terms_update_teacher" ON public.academic_terms
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- students
-- ============================================================
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR public.is_student_self(id)
    OR public.is_parent_of_student(id)
  );

CREATE POLICY "students_insert_teacher" ON public.students
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "students_update_teacher" ON public.students
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- parent_student_links
-- ============================================================
CREATE POLICY "psl_select" ON public.parent_student_links
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR parent_profile_id = public.current_profile_id()
  );

CREATE POLICY "psl_insert_teacher" ON public.parent_student_links
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "psl_update_teacher" ON public.parent_student_links
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- books
-- ============================================================
CREATE POLICY "books_select" ON public.books
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = books.id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

CREATE POLICY "books_insert_teacher" ON public.books
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "books_update_teacher" ON public.books
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- book_sections
-- ============================================================
CREATE POLICY "sections_select" ON public.book_sections
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_sections.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

CREATE POLICY "sections_insert_teacher" ON public.book_sections
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "sections_update_teacher" ON public.book_sections
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- book_tests
-- ============================================================
CREATE POLICY "tests_select" ON public.book_tests
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_tests.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

CREATE POLICY "tests_insert_teacher" ON public.book_tests
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "tests_update_teacher" ON public.book_tests
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- student_book_assignments
-- ============================================================
CREATE POLICY "sba_select" ON public.student_book_assignments
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

CREATE POLICY "sba_insert_teacher" ON public.student_book_assignments
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "sba_update_teacher" ON public.student_book_assignments
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- homework_batches
-- ============================================================
CREATE POLICY "hb_select" ON public.homework_batches
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

CREATE POLICY "hb_insert_teacher" ON public.homework_batches
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "hb_update_teacher" ON public.homework_batches
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- homework_items
-- ============================================================
CREATE POLICY "hi_select" ON public.homework_items
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.homework_batches hb
      WHERE hb.id = homework_items.homework_batch_id
        AND (public.is_student_self(hb.student_id) OR public.is_parent_of_student(hb.student_id))
    )
  );

CREATE POLICY "hi_insert_teacher" ON public.homework_items
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- Teachers can update any field; students can ONLY update status via RPC (no direct update policy)
CREATE POLICY "hi_update_teacher" ON public.homework_items
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- test_completions
-- ============================================================
CREATE POLICY "tc_select" ON public.test_completions
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

-- Students and teachers create completions via RPC (SECURITY DEFINER) — no direct insert policy
CREATE POLICY "tc_insert_teacher" ON public.test_completions
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "tc_update_teacher" ON public.test_completions
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

-- ============================================================
-- invitations
-- ============================================================
CREATE POLICY "inv_select_teacher" ON public.invitations
  FOR SELECT USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "inv_insert_teacher" ON public.invitations
  FOR INSERT WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));

CREATE POLICY "inv_update_teacher" ON public.invitations
  FOR UPDATE USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']));
