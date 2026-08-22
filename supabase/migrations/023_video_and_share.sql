-- ============================================================
-- 023_video_and_share  (R4 - Dilim 3: video desteği)
--
-- Kural (R4 §6): Video, test/sayfa planının hesap birimi DEĞİLDİR ve
-- tempo matematiğine dahil edilmez. Bu yüzden video görevleri bilinçli
-- olarak homework_items'a yazılmaz — o tablo book_test_id zorunlu tutuyor
-- ve her satırı plan matematiğine giriyor. Bunun yerine ayrı, hafif bir
-- işaretleme tablosu kullanılır.
--
-- Ayrıca öğretmen onayı gerekmez: öğrenci "İzledim" der ve biter.
-- ============================================================

-- ============================================================
-- 1) Öğrenci-kitap bazında gösterim tercihi
--
-- 9-10-11 gibi ara sınıflarda haftalık hatırlatma daha sık kullanılabilir;
-- 12/mezunda kaynak olarak gösterim yeterli olabilir (R4 §6).
-- ============================================================
ALTER TABLE public.student_book_assignments
  ADD COLUMN IF NOT EXISTS video_display TEXT NOT NULL DEFAULT 'resource';

ALTER TABLE public.student_book_assignments
  DROP CONSTRAINT IF EXISTS student_book_assignments_video_display_check;
ALTER TABLE public.student_book_assignments
  ADD CONSTRAINT student_book_assignments_video_display_check
  CHECK (video_display IN ('resource', 'weekly_reminder'));

-- ============================================================
-- 2) video_watch_marks
--
-- Kitap ya da bölüm seviyesinde "izledim" işareti. section_id NULL ise
-- işaret kitap genelindeki video kaynağına aittir. Her sayfa/test için
-- video eşleştirmesi YAPILMAZ; izleme yüzdesi/süresi tutulmaz.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.video_watch_marks (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_book_assignment_id  UUID NOT NULL REFERENCES public.student_book_assignments(id) ON DELETE CASCADE,
  section_id                  UUID REFERENCES public.book_sections(id) ON DELETE CASCADE,
  watched_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by_profile_id        UUID REFERENCES public.profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aynı kaynak iki kez işaretlenmesin. section_id NULL olabildiği için
-- COALESCE ile sabit bir UUID'ye düşürülür (Postgres'te NULL'lar
-- birbirine eşit sayılmaz, aksi halde kısıt işlemezdi).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_video_watch_mark
  ON public.video_watch_marks (
    student_book_assignment_id,
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

ALTER TABLE public.video_watch_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_watch_marks_select ON public.video_watch_marks;
CREATE POLICY video_watch_marks_select ON public.video_watch_marks
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

-- Öğretmen onayı gerekmediği için öğrencinin kendisi de yazabilir.
DROP POLICY IF EXISTS video_watch_marks_insert ON public.video_watch_marks;
CREATE POLICY video_watch_marks_insert ON public.video_watch_marks
  FOR INSERT WITH CHECK (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND public.is_student_self(sba.student_id)
    )
  );

DROP POLICY IF EXISTS video_watch_marks_delete ON public.video_watch_marks;
CREATE POLICY video_watch_marks_delete ON public.video_watch_marks
  FOR DELETE USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND public.is_student_self(sba.student_id)
    )
  );
