-- ============================================================
-- 001_initial_schema.sql
-- Koçluk Takip Sistemi — Core Tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id          UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL DEFAULT '',
  email                 TEXT,
  phone                 TEXT,
  avatar_url            TEXT,
  default_workspace_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- workspaces
-- ============================================================
CREATE TABLE public.workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'individual' CHECK (type IN ('individual', 'institution')),
  owner_profile_id  UUID REFERENCES public.profiles(id),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from profiles to workspaces (after workspaces exists)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_workspace_id_fkey
  FOREIGN KEY (default_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- ============================================================
-- workspace_members
-- ============================================================
CREATE TABLE public.workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'teacher', 'assistant', 'student', 'parent')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'inactive', 'removed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, profile_id, role)
);

-- ============================================================
-- academic_terms
-- ============================================================
CREATE TABLE public.academic_terms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  start_date            DATE,
  end_date              DATE,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by_profile_id UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- students
-- ============================================================
CREATE TABLE public.students (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id                 UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  primary_teacher_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name                  TEXT NOT NULL,
  email                      TEXT,
  phone                      TEXT,
  grade_level                TEXT,
  exam_type                  TEXT CHECK (exam_type IN ('TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other')),
  notes                      TEXT,
  status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- parent_student_links
-- ============================================================
CREATE TABLE public.parent_student_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relationship_type   TEXT CHECK (relationship_type IN ('mother', 'father', 'guardian', 'other')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'inactive', 'removed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, parent_profile_id, student_id)
);

-- ============================================================
-- books
-- ============================================================
CREATE TABLE public.books (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  academic_term_id      UUID NOT NULL REFERENCES public.academic_terms(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  publisher             TEXT,
  subject               TEXT NOT NULL,
  exam_type             TEXT CHECK (exam_type IN ('TYT', 'AYT', 'LGS', 'Other')),
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_by_profile_id UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- book_sections
-- ============================================================
CREATE TABLE public.book_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  order_index   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- book_tests
-- ============================================================
CREATE TABLE public.book_tests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  section_id    UUID NOT NULL REFERENCES public.book_sections(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  order_index   INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, order_index)
);

-- ============================================================
-- student_book_assignments
-- ============================================================
CREATE TABLE public.student_book_assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  academic_term_id      UUID NOT NULL REFERENCES public.academic_terms(id),
  student_id            UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  book_id               UUID NOT NULL REFERENCES public.books(id),
  assigned_by_profile_id UUID REFERENCES public.profiles(id),
  start_date            DATE,
  target_end_date       DATE,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, book_id, academic_term_id)
);

-- ============================================================
-- homework_batches
-- ============================================================
CREATE TABLE public.homework_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  academic_term_id      UUID NOT NULL REFERENCES public.academic_terms(id),
  student_id            UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title                 TEXT,
  description           TEXT,
  due_date              DATE NOT NULL,
  assigned_by_profile_id UUID REFERENCES public.profiles(id),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'archived')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- homework_items
-- ============================================================
CREATE TABLE public.homework_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  homework_batch_id           UUID NOT NULL REFERENCES public.homework_batches(id) ON DELETE CASCADE,
  student_book_assignment_id  UUID NOT NULL REFERENCES public.student_book_assignments(id),
  book_id                     UUID NOT NULL REFERENCES public.books(id),
  section_id                  UUID NOT NULL REFERENCES public.book_sections(id),
  book_test_id                UUID NOT NULL REFERENCES public.book_tests(id),
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at                TIMESTAMPTZ,
  completed_by_profile_id     UUID REFERENCES public.profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (homework_batch_id, book_test_id)
);

-- ============================================================
-- test_completions
-- ============================================================
CREATE TABLE public.test_completions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  academic_term_id            UUID NOT NULL REFERENCES public.academic_terms(id),
  student_id                  UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_book_assignment_id  UUID NOT NULL REFERENCES public.student_book_assignments(id),
  book_test_id                UUID NOT NULL REFERENCES public.book_tests(id),
  completed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by_profile_id     UUID REFERENCES public.profiles(id),
  source                      TEXT NOT NULL DEFAULT 'homework' CHECK (source IN ('homework', 'teacher_manual', 'import')),
  source_homework_item_id     UUID REFERENCES public.homework_items(id),
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reverted')),
  reverted_at                 TIMESTAMPTZ,
  reverted_by_profile_id      UUID REFERENCES public.profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: only one active completion per (assignment, test)
CREATE UNIQUE INDEX uniq_active_test_completion
  ON public.test_completions (student_book_assignment_id, book_test_id)
  WHERE status = 'active';

-- ============================================================
-- invitations
-- ============================================================
CREATE TABLE public.invitations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invited_email           TEXT,
  invited_phone           TEXT,
  role                    TEXT NOT NULL CHECK (role IN ('student', 'parent', 'teacher', 'assistant')),
  student_id              UUID REFERENCES public.students(id) ON DELETE CASCADE,
  parent_student_link_id  UUID REFERENCES public.parent_student_links(id) ON DELETE CASCADE,
  token_hash              TEXT NOT NULL UNIQUE,
  expires_at              TIMESTAMPTZ NOT NULL,
  accepted_at             TIMESTAMPTZ,
  accepted_by_profile_id  UUID REFERENCES public.profiles(id),
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_by_profile_id   UUID REFERENCES public.profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- profiles
CREATE INDEX idx_profiles_auth_user_id ON public.profiles (auth_user_id);

-- workspace_members
CREATE INDEX idx_wm_workspace_id ON public.workspace_members (workspace_id);
CREATE INDEX idx_wm_profile_id ON public.workspace_members (profile_id);

-- academic_terms
CREATE INDEX idx_terms_workspace_id ON public.academic_terms (workspace_id);
CREATE INDEX idx_terms_status ON public.academic_terms (workspace_id, status);

-- students
CREATE INDEX idx_students_workspace_id ON public.students (workspace_id);
CREATE INDEX idx_students_workspace_status ON public.students (workspace_id, status);
CREATE INDEX idx_students_profile_id ON public.students (profile_id);

-- parent_student_links
CREATE INDEX idx_psl_workspace_student ON public.parent_student_links (workspace_id, student_id);
CREATE INDEX idx_psl_parent_profile ON public.parent_student_links (parent_profile_id);

-- books
CREATE INDEX idx_books_workspace_term ON public.books (workspace_id, academic_term_id);
CREATE INDEX idx_books_workspace_status ON public.books (workspace_id, status);

-- book_sections
CREATE INDEX idx_sections_book_id ON public.book_sections (book_id);
CREATE INDEX idx_sections_workspace_book ON public.book_sections (workspace_id, book_id);

-- book_tests
CREATE INDEX idx_tests_book_id ON public.book_tests (book_id);
CREATE INDEX idx_tests_section_id ON public.book_tests (section_id);
CREATE INDEX idx_tests_workspace_book ON public.book_tests (workspace_id, book_id);

-- student_book_assignments
CREATE INDEX idx_sba_workspace_student ON public.student_book_assignments (workspace_id, student_id);
CREATE INDEX idx_sba_workspace_term ON public.student_book_assignments (workspace_id, academic_term_id);
CREATE INDEX idx_sba_student_status ON public.student_book_assignments (student_id, status);

-- homework_batches
CREATE INDEX idx_hb_workspace_student ON public.homework_batches (workspace_id, student_id);
CREATE INDEX idx_hb_workspace_term ON public.homework_batches (workspace_id, academic_term_id);
CREATE INDEX idx_hb_due_date ON public.homework_batches (due_date);
CREATE INDEX idx_hb_student_due ON public.homework_batches (student_id, due_date);

-- homework_items
CREATE INDEX idx_hi_workspace_batch ON public.homework_items (workspace_id, homework_batch_id);
CREATE INDEX idx_hi_sba ON public.homework_items (student_book_assignment_id);
CREATE INDEX idx_hi_book_test ON public.homework_items (book_test_id);
CREATE INDEX idx_hi_status ON public.homework_items (status);

-- test_completions
CREATE INDEX idx_tc_workspace_student ON public.test_completions (workspace_id, student_id);
CREATE INDEX idx_tc_sba ON public.test_completions (student_book_assignment_id);
CREATE INDEX idx_tc_book_test ON public.test_completions (book_test_id);

-- invitations
CREATE INDEX idx_inv_workspace ON public.invitations (workspace_id);
CREATE INDEX idx_inv_student ON public.invitations (student_id);
CREATE INDEX idx_inv_status ON public.invitations (status);

-- ============================================================
-- updated_at auto-update trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at         BEFORE UPDATE ON public.profiles         FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_workspaces_updated_at        BEFORE UPDATE ON public.workspaces        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_academic_terms_updated_at    BEFORE UPDATE ON public.academic_terms    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_students_updated_at          BEFORE UPDATE ON public.students          FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_psl_updated_at               BEFORE UPDATE ON public.parent_student_links FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_books_updated_at             BEFORE UPDATE ON public.books             FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_book_sections_updated_at     BEFORE UPDATE ON public.book_sections     FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_book_tests_updated_at        BEFORE UPDATE ON public.book_tests        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_sba_updated_at               BEFORE UPDATE ON public.student_book_assignments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_hw_batches_updated_at        BEFORE UPDATE ON public.homework_batches  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_hw_items_updated_at          BEFORE UPDATE ON public.homework_items    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_tc_updated_at                BEFORE UPDATE ON public.test_completions  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_inv_updated_at               BEFORE UPDATE ON public.invitations       FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
