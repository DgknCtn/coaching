-- ============================================================
-- 019_weekly_plan_drafts
-- R3 v2 §B: Kitap Haritası'nda yapılan test seçimleri, eğitmen kitaplar
-- arasında dolaşırken ve sayfa yenilendiğinde kaybolmamalı. Seçimler
-- yalnız component state'inde tutulursa F5 hepsini siler.
--
-- Taslak, YAYINLANMIŞ ödev değildir: burada biriken satırlar ilerlemeye
-- sayılmaz, öğrenciye görünmez. Yayınlama anında mevcut create_homework_batch
-- RPC'si çalışır ve taslak temizlenir — ikinci bir ödev motoru YOKTUR.
--
-- Kapsam: öğretmen başına, öğrenci başına tek taslak. İki eğitmen aynı
-- öğrenci için aynı anda plan hazırlarsa birbirlerinin seçimini ezmez.
-- ============================================================

-- ============================================================
-- 1) weekly_plan_drafts — taslak üst kaydı
-- ============================================================
CREATE TABLE IF NOT EXISTS public.weekly_plan_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  due_date            DATE,
  title               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, student_id, teacher_profile_id)
);

-- ============================================================
-- 2) weekly_plan_draft_items — seçilen testler
-- ============================================================
CREATE TABLE IF NOT EXISTS public.weekly_plan_draft_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                    UUID NOT NULL REFERENCES public.weekly_plan_drafts(id) ON DELETE CASCADE,
  student_book_assignment_id  UUID NOT NULL REFERENCES public.student_book_assignments(id) ON DELETE CASCADE,
  book_test_id                UUID NOT NULL REFERENCES public.book_tests(id) ON DELETE CASCADE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, book_test_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_plan_draft_items_draft
  ON public.weekly_plan_draft_items (draft_id);

-- ============================================================
-- 3) RLS
-- 016'daki kalıp: yazma yalnızca SECURITY DEFINER RPC'ler üzerinden,
-- tablolarda doğrudan INSERT/UPDATE/DELETE policy'si bilinçli olarak yok.
-- Taslak eğitmenin kendi çalışma alanıdır; öğrenci/veli göremez.
-- ============================================================
ALTER TABLE public.weekly_plan_drafts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_plan_draft_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts;
CREATE POLICY "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts
  FOR SELECT USING (
    teacher_profile_id = public.current_profile_id()
    AND public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
  );

DROP POLICY IF EXISTS "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items;
CREATE POLICY "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan_drafts d
      WHERE d.id = weekly_plan_draft_items.draft_id
        AND d.teacher_profile_id = public.current_profile_id()
        AND public.has_workspace_role(d.workspace_id, ARRAY['owner', 'teacher'])
    )
  );

-- ============================================================
-- 4) upsert_weekly_plan_draft
-- Tüm seçim setini idempotent yazar: istemci "şu an seçili olanlar" listesini
-- gönderir, fonksiyon farkı uygular. Debounce'lu otomatik kayıt bu yüzden
-- güvenlidir — aynı payload iki kez gelirse ikinci çağrı bir şey değiştirmez.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_weekly_plan_draft(
  p_workspace_id  UUID,
  p_student_id    UUID,
  p_due_date      DATE DEFAULT NULL,
  p_title         TEXT DEFAULT NULL,
  p_items         JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_draft_id    UUID;
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

  INSERT INTO public.weekly_plan_drafts (
    workspace_id, student_id, teacher_profile_id, due_date, title
  ) VALUES (
    p_workspace_id, p_student_id, v_profile_id, p_due_date, p_title
  )
  ON CONFLICT (workspace_id, student_id, teacher_profile_id) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        title    = EXCLUDED.title,
        updated_at = NOW()
  RETURNING id INTO v_draft_id;

  -- Artık seçili olmayanları sil.
  DELETE FROM public.weekly_plan_draft_items i
  WHERE i.draft_id = v_draft_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) e
      WHERE (e->>'book_test_id')::UUID = i.book_test_id
    );

  -- Yeni seçilenleri ekle. Atamanın gerçekten bu öğrenciye ve bu workspace'e
  -- ait olduğu doğrulanır; aksi halde taslak üzerinden başka bir öğrencinin
  -- kitabına referans verilebilirdi.
  INSERT INTO public.weekly_plan_draft_items (
    draft_id, student_book_assignment_id, book_test_id
  )
  SELECT
    v_draft_id,
    (e->>'student_book_assignment_id')::UUID,
    (e->>'book_test_id')::UUID
  FROM jsonb_array_elements(p_items) e
  WHERE EXISTS (
    SELECT 1
    FROM public.student_book_assignments sba
    JOIN public.book_tests bt ON bt.book_id = sba.book_id
    WHERE sba.id = (e->>'student_book_assignment_id')::UUID
      AND sba.student_id = p_student_id
      AND sba.workspace_id = p_workspace_id
      AND bt.id = (e->>'book_test_id')::UUID
      AND bt.status = 'active'
  )
  ON CONFLICT (draft_id, book_test_id) DO NOTHING;

  RETURN jsonb_build_object(
    'draft_id', v_draft_id,
    'item_count', (SELECT COUNT(*) FROM public.weekly_plan_draft_items WHERE draft_id = v_draft_id)
  );
END;
$$;

-- ============================================================
-- 5) clear_weekly_plan_draft
-- Plan yayınlandıktan sonra (veya eğitmen "temizle" dediğinde) çağrılır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_weekly_plan_draft(
  p_workspace_id  UUID,
  p_student_id    UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.weekly_plan_drafts
  WHERE workspace_id = p_workspace_id
    AND student_id = p_student_id
    AND teacher_profile_id = v_profile_id;

  RETURN jsonb_build_object('cleared', true);
END;
$$;
