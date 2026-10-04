-- ============================================================
-- 132 — ÖDEV SON TESLİMİ: TARİH + SAAT (M1.0-01 §2)
--
-- homework_batches.due_date yalnız GÜN taşıyordu. Haftalık Akışın
-- kapanışı (weekly_flows.due_at) saatliyken yayınlanan ödev "10 Ekim"
-- diyor, "18:00"ı kaybediyordu. Öğrenci/veli "bir sonraki ders ne
-- zaman?" diye yeniden soruyordu.
--
-- KARAR: due_at TIMESTAMPTZ EKLENİR, due_date KALIR. Gecikme görünümleri,
-- attach_batch_to_flow ve today_local() karşılaştırmaları gün
-- semantiğiyle çalışıyor ve çalışmaya devam etmeli. Yeni yayında
-- due_date, due_at'in İSTANBUL günüdür (RPC türetir; istemci iki ayrı
-- değer gönderip çelişemez).
--
-- ESKİ KAYITLAR: akışa bağlı partide akışın due_at'i; diğerlerinde
-- due_date günü 23:59 (İstanbul). due_at NULL kalabilir — okuyan taraf
-- NULL'da yalnız günü gösterir.
--
-- İMZA DEĞİŞİYOR: create_homework_batch ve upsert_weekly_plan_draft'a
-- p_due_at eklenir. Aynı adla iki aşırı yükleme DEFAULT'lu parametrelerle
-- belirsizlik yaratır; eski imza önce düşürülür (098:93 örneği).
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.homework_batches
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

ALTER TABLE public.weekly_plan_drafts
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.homework_batches.due_at IS
  'Son teslim anı (M1.0-01). due_date bunun Europe/Istanbul günüdür; NULL ise yalnız gün bilinir.';

-- Eski kayıtların doldurulması.
UPDATE public.homework_batches hb
   SET due_at = wf.due_at
  FROM public.weekly_flows wf
 WHERE hb.weekly_flow_id = wf.id
   AND hb.due_at IS NULL
   AND wf.due_at IS NOT NULL
   AND (wf.due_at AT TIME ZONE 'Europe/Istanbul')::DATE = hb.due_date;

UPDATE public.homework_batches
   SET due_at = ((due_date + TIME '23:59') AT TIME ZONE 'Europe/Istanbul')
 WHERE due_at IS NULL;

-- ============================================================
-- create_homework_batch — p_due_at
-- Gövde 014'teki tanımın aynısı; fark: due_at yazılır ve due_date onun
-- yerel gününden türetilir.
-- ============================================================
DROP FUNCTION IF EXISTS public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_homework_batch(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_student_id        UUID,
  p_due_date          DATE,
  p_title             TEXT DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_items             JSONB DEFAULT '[]'::JSONB,
  p_due_at            TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id  UUID;
  v_batch_id    UUID;
  v_item        JSONB;
  v_sba_id      UUID;
  v_test_id     UUID;
  v_book_id     UUID;
  v_section_id  UUID;
  v_due_date    DATE;
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

  v_due_date := COALESCE((p_due_at AT TIME ZONE 'Europe/Istanbul')::DATE, p_due_date);

  INSERT INTO public.homework_batches (
    workspace_id, academic_term_id, student_id, title, description,
    due_date, due_at, assigned_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_student_id, p_title, p_description,
    v_due_date, p_due_at, v_profile_id
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

REVOKE ALL ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- upsert_weekly_plan_draft — p_due_at
-- Gövde 030'daki tanımın aynısı; fark: due_at taşınır.
-- ============================================================
DROP FUNCTION IF EXISTS public.upsert_weekly_plan_draft(UUID, UUID, DATE, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.upsert_weekly_plan_draft(
  p_workspace_id  UUID,
  p_student_id    UUID,
  p_due_date      DATE DEFAULT NULL,
  p_title         TEXT DEFAULT NULL,
  p_items         JSONB DEFAULT '[]'::JSONB,
  p_note          TEXT DEFAULT NULL,
  p_due_at        TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
    workspace_id, student_id, teacher_profile_id, due_date, due_at, title, note
  ) VALUES (
    p_workspace_id, p_student_id, v_profile_id,
    COALESCE((p_due_at AT TIME ZONE 'Europe/Istanbul')::DATE, p_due_date),
    p_due_at, p_title, p_note
  )
  ON CONFLICT (workspace_id, student_id, teacher_profile_id) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        due_at   = EXCLUDED.due_at,
        title    = EXCLUDED.title,
        note     = EXCLUDED.note,
        updated_at = NOW()
  RETURNING id INTO v_draft_id;

  DELETE FROM public.weekly_plan_draft_items i
  WHERE i.draft_id = v_draft_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_items) e
      WHERE (e->>'book_test_id')::UUID = i.book_test_id
    );

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
$fn$;

REVOKE ALL ON FUNCTION public.upsert_weekly_plan_draft(UUID, UUID, DATE, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_weekly_plan_draft(UUID, UUID, DATE, TEXT, JSONB, TEXT, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.upsert_weekly_plan_draft(UUID, UUID, DATE, TEXT, JSONB, TEXT, TIMESTAMPTZ);
--   -- 014 (create_homework_batch) ve 030 (upsert_weekly_plan_draft)
--   -- tanımlarını yeniden çalıştırın, ardından grant'ları 109 kalıbıyla verin.
--   ALTER TABLE public.homework_batches   DROP COLUMN IF EXISTS due_at;
--   ALTER TABLE public.weekly_plan_drafts DROP COLUMN IF EXISTS due_at;
-- ============================================================
