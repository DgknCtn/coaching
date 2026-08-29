-- ============================================================
-- 030_homework_note  (R6-05)
--
-- Sistem kaynak/test/sayfa bilgisini iyi üretiyor ama insan bağlamını
-- taşımıyordu: "Parçalı fonksiyona kadar", "videoyu izle", "yapamadığın
-- soruları gruba at" gibi notlar her hafta WhatsApp'ta elle yazılıyordu.
--
-- YENİ KOLON GEREKMİYOR (yayınlanan ödev için): homework_batches.description
-- 001'den beri var ve kullanılmıyordu. R6-05 onu "Ödev Notu" olarak
-- kullanır. create_homework_batch zaten p_description parametresini
-- alıyordu; tek eksik, uygulamanın onu hep NULL göndermesiydi.
--
-- EKLENEN TEK ŞEY: taslağa not alanı. Sepet sunucu tarafında saklanıyor
-- (019) ve refresh/oturum dönüşünde korunuyor; not da aynı şekilde
-- korunmalı, yoksa eğitmen yazdığı notu tarayıcı yenilenince kaybeder.
--
-- Ödev BAŞINA TEK not alanı vardır. Bölüm veya test başına ayrı not
-- bilinçli olarak eklenmez — dokümanın açık kuralı.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) weekly_plan_drafts.note
-- ============================================================
ALTER TABLE public.weekly_plan_drafts
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ============================================================
-- 2) upsert_weekly_plan_draft — p_note
--
-- 019'daki gövdenin aynısı; tek fark not alanının taşınması. p_note sona
-- ve DEFAULT ile eklendi, mevcut çağrılar imzayı değiştirmeden çalışır.
--
-- NOT: 019'un gövdesi uzun (item senkronu dahil). Burada yalnız INSERT/
-- UPDATE kısmını değiştirmek için fonksiyonu bütün olarak yeniden yazmak
-- yerine, 019'daki tanımın devamı korunacak şekilde tam gövde tekrar edilir
-- — CREATE OR REPLACE kısmi güncelleme yapamaz.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_weekly_plan_draft(
  p_workspace_id  UUID,
  p_student_id    UUID,
  p_due_date      DATE DEFAULT NULL,
  p_title         TEXT DEFAULT NULL,
  p_items         JSONB DEFAULT '[]'::JSONB,
  p_note          TEXT DEFAULT NULL
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
    workspace_id, student_id, teacher_profile_id, due_date, title, note
  ) VALUES (
    p_workspace_id, p_student_id, v_profile_id, p_due_date, p_title, p_note
  )
  ON CONFLICT (workspace_id, student_id, teacher_profile_id) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        title    = EXCLUDED.title,
        note     = EXCLUDED.note,
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
  -- kitabına referans verilebilirdi. (019'daki gövde birebir korunur.)
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

-- ============================================================
-- ROLLBACK
--
--   ALTER TABLE public.weekly_plan_drafts DROP COLUMN IF EXISTS note;
--   -- upsert_weekly_plan_draft için 019_weekly_plan_drafts.sql içindeki
--   -- tanımı aynen yeniden çalıştırın.
--
-- homework_batches.description'a dokunulmadı: o kolon 001'den beri vardı,
-- bu migration yalnız onu KULLANMAYA başladı.
-- ============================================================
