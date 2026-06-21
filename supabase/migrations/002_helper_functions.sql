-- ============================================================
-- 002_helper_functions.sql
-- RLS helper functions (SECURITY DEFINER — run as postgres)
-- ============================================================

-- Returns the profile.id of the currently authenticated user
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.profiles WHERE auth_user_id = auth.uid();
$$;

-- True if the current user is an active member of the given workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND profile_id   = public.current_profile_id()
      AND status       = 'active'
  );
$$;

-- True if the current user has one of the given roles in the workspace
CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND profile_id   = public.current_profile_id()
      AND role         = ANY(p_roles)
      AND status       = 'active'
  );
$$;

-- True if the current user IS the given student (profile linked to student record)
CREATE OR REPLACE FUNCTION public.is_student_self(p_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE id         = p_student_id
      AND profile_id = public.current_profile_id()
  );
$$;

-- True if the current user is a parent linked to the given student
CREATE OR REPLACE FUNCTION public.is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE student_id        = p_student_id
      AND parent_profile_id = public.current_profile_id()
      AND status            = 'active'
  );
$$;

-- True if the current user can read data about a student
-- (teacher/owner in workspace, or student themselves, or linked parent)
CREATE OR REPLACE FUNCTION public.can_read_student(p_student_id UUID, p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR public.is_student_self(p_student_id)
    OR public.is_parent_of_student(p_student_id);
$$;
