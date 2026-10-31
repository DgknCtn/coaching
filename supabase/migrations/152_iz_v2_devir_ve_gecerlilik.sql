-- ============================================================
-- 152 — İz Birleşik Revizyon V2 (31.10.2026)
--
--   R03  Açık çalışmaları haftaya DEVRETMEK (yalnız kalan iş taşınır)
--   H04  Geçerlilik tarihini DÜZELTMEK (yeni sürüm üretmeden)
--
-- ------------------------------------------------------------
-- R03 · DEVİR MODELİ
--
-- Aidiyet parti düzeyinde (homework_batches.weekly_flow_id, 077). Kısmi
-- tamamlanmış bir ödevi bütün olarak taşımak, tamamlanmış kalemleri de
-- yeni haftaya sürüklerdi; belge "yalnız kalan sorumluluk taşınsın"
-- diyor. Bu yüzden devir KALEM düzeyindedir:
--
--   - Hedef haftada, kaynak partinin başlığıyla YENİ bir parti açılır;
--     yalnız 'pending' kalemlerin kopyası oraya girer.
--   - Kaynak kalem SİLİNMEZ: 'cancelled' + carried_to_item_id ile
--     işaretlenir. Kapanmış haftanın fotoğrafı (close_weekly_flow) zaten
--     alınmıştır ve değişmez; kalemin hangi haftadan geldiği yeni
--     kalemin carried_from_item_id'sinden izlenir.
--   - Aynı kalem İKİ KEZ devredilemez: carried_from_item_id tekildir ve
--     zaten devredilmiş kalem atlanır (tekrar basmak kopya üretmez).
--   - Onaya gönderilmiş (pending_approval) kalem devredilmez — öğrenci
--     işini yapmış, onay bekliyor. Ekran bu ikisini ayrı gösterir.
--
-- "Gelecek haftaya devret": gelecek hafta henüz açılmamış olabilir.
-- Kalem TAŞINMAZ; carry_requested_at işaretlenir. Hafta geçişi
-- penceresi (Ödev Planlama) bu kalemleri önceden seçili getirir.
--
-- ------------------------------------------------------------
-- H04 · GEÇERLİLİK TARİHİ DÜZELTME
--
-- set_finance_model (139) (öğrenci, valid_from) üzerinden upsert eder:
-- 01.10 → 01.09 "düzeltmesi" 01.09'da YENİ bir sürüm açıyor, 01.10
-- sürümü yerinde kalıyordu. Bugün geçerli olan hâlâ 01.10 olduğu için
-- başlık eski tarihi gösteriyordu. correct_finance_model_date mevcut
-- sürümün tarihini TAŞIR; yeni tarihte (eski hatanın bıraktığı) bir
-- sürüm varsa birleştirilir. Tahakkuk satırları kendi tutarını
-- kopyaladığı için (141) mevcut tahakkuklar yeniden fiyatlanmaz.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Devir sütunları
-- ------------------------------------------------------------
ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS carried_to_item_id UUID
    REFERENCES public.homework_items(id) ON DELETE SET NULL;

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS carried_from_item_id UUID
    REFERENCES public.homework_items(id) ON DELETE SET NULL;

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS carried_at TIMESTAMPTZ;

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS carry_requested_at TIMESTAMPTZ;

-- Bir kalemin en fazla BİR devri olur.
CREATE UNIQUE INDEX IF NOT EXISTS uq_homework_items_carried_from
  ON public.homework_items (carried_from_item_id)
  WHERE carried_from_item_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2) carry_homework_items
--
--   p_target = 'current' → aktif Haftalık Akış (yoksa hata)
--   p_target = 'next'    → yalnız işaret (carry_requested_at)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carry_homework_items(
  p_item_ids UUID[],
  p_target   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_student_id UUID;
  v_flow       public.weekly_flows%ROWTYPE;
  v_src        RECORD;
  v_new_batch  UUID;
  v_new_item   UUID;
  v_carried    INT := 0;
  v_skipped    INT := 0;
  v_requested  INT := 0;
  v_batches    INT := 0;
  v_last_batch UUID := NULL;
BEGIN
  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('carried', 0, 'requested', 0, 'skipped', 0, 'batches', 0);
  END IF;

  IF p_target NOT IN ('current', 'next') THEN
    RAISE EXCEPTION 'Geçersiz devir hedefi.';
  END IF;

  -- Yetki tek tek (dizi yabancı id taşıyabilir — 135 ile aynı gerekçe).
  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    WHERE hi.id = ANY(p_item_ids)
      AND NOT public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  -- Tek öğrenci: devir bir öğrencinin haftaları arasında olur.
  IF (
    SELECT COUNT(DISTINCT hb.student_id)
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.id = ANY(p_item_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'Devredilecek çalışmalar tek bir öğrenciye ait olmalı.';
  END IF;

  SELECT hb.student_id INTO v_student_id
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hi.id = ANY(p_item_ids)
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('carried', 0, 'requested', 0, 'skipped', 0, 'batches', 0);
  END IF;

  -- GELECEK HAFTA: yalnız işaret.
  IF p_target = 'next' THEN
    UPDATE public.homework_items hi
       SET carry_requested_at = NOW(),
           updated_at = NOW()
     WHERE hi.id = ANY(p_item_ids)
       AND hi.status = 'pending'
       AND hi.carried_to_item_id IS NULL;
    GET DIAGNOSTICS v_requested = ROW_COUNT;
    RETURN jsonb_build_object(
      'carried', 0,
      'requested', v_requested,
      'skipped', COALESCE(array_length(p_item_ids, 1), 0) - v_requested,
      'batches', 0
    );
  END IF;

  SELECT * INTO v_flow
  FROM public.weekly_flows
  WHERE student_id = v_student_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Açık bir çalışma haftası yok; önce yeni haftayı açın.';
  END IF;

  -- Kaynak partiye göre sıralı: her kaynak parti için hedefte TEK parti.
  FOR v_src IN
    SELECT hi.*, hb.title AS b_title, hb.description AS b_description,
           hb.academic_term_id AS b_term, hb.weekly_flow_id AS b_flow,
           hb.status AS b_status
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.id = ANY(p_item_ids)
    ORDER BY hi.homework_batch_id, hi.created_at, hi.id
  LOOP
    -- Yalnız kalan iş; zaten devredilmiş, teslim edilmiş ya da bu
    -- haftada duran kalem atlanır.
    IF v_src.status <> 'pending'
       OR v_src.carried_to_item_id IS NOT NULL
       OR v_src.b_status <> 'active'
       OR v_src.b_flow IS NOT DISTINCT FROM v_flow.id THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_last_batch IS DISTINCT FROM v_src.homework_batch_id THEN
      INSERT INTO public.homework_batches (
        workspace_id, academic_term_id, student_id, title, description,
        due_date, due_at, weekly_flow_id, assigned_by_profile_id
      ) VALUES (
        v_src.workspace_id, v_src.b_term, v_student_id, v_src.b_title, v_src.b_description,
        (v_flow.due_at AT TIME ZONE 'Europe/Istanbul')::DATE, v_flow.due_at, v_flow.id,
        public.current_profile_id()
      ) RETURNING id INTO v_new_batch;
      v_last_batch := v_src.homework_batch_id;
      v_batches := v_batches + 1;
    END IF;

    INSERT INTO public.homework_items (
      workspace_id, homework_batch_id, student_book_assignment_id,
      book_id, section_id, book_test_id, carried_from_item_id
    ) VALUES (
      v_src.workspace_id, v_new_batch, v_src.student_book_assignment_id,
      v_src.book_id, v_src.section_id, v_src.book_test_id, v_src.id
    ) RETURNING id INTO v_new_item;

    UPDATE public.homework_items hi
       SET status = 'cancelled',
           released_at = NOW(),
           released_by_profile_id = public.current_profile_id(),
           release_reason = 'Devredildi',
           carried_to_item_id = v_new_item,
           carried_at = NOW(),
           carry_requested_at = NULL,
           updated_at = NOW()
     WHERE hi.id = v_src.id;

    v_carried := v_carried + 1;
  END LOOP;

  -- Açık kalemi kalmayan kaynak parti arşive iner (release ile aynı kural).
  UPDATE public.homework_batches hb
     SET status = 'archived', updated_at = NOW()
   WHERE hb.status = 'active'
     AND hb.id IN (SELECT homework_batch_id FROM public.homework_items WHERE id = ANY(p_item_ids))
     AND NOT EXISTS (
       SELECT 1 FROM public.homework_items hi
       WHERE hi.homework_batch_id = hb.id
         AND hi.status IN ('pending', 'pending_approval')
     );

  RETURN jsonb_build_object(
    'carried', v_carried,
    'requested', 0,
    'skipped', v_skipped,
    'batches', v_batches,
    'flow_id', v_flow.id,
    'due_at', v_flow.due_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.carry_homework_items(UUID[], TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carry_homework_items(UUID[], TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 3) restore_batch_to_active_load — DEVREDİLMİŞ kalem geri açılmaz
--
-- 135 gövdesi + tek fark: carried_to_item_id dolu kalem 'cancelled'
-- olsa da diriltilmez. Aksi hâlde devredilen iş iki haftada birden
-- açık görünürdü (kopya sorumluluk).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_batch_to_active_load(
  p_batch_id       UUID,
  p_weekly_flow_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch public.homework_batches%ROWTYPE;
  v_flow  public.weekly_flows%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödev bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_batch.status <> 'archived' THEN
    RETURN;
  END IF;

  SELECT * INTO v_flow FROM public.weekly_flows WHERE id = p_weekly_flow_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haftalık akış bulunamadı.';
  END IF;

  IF v_flow.student_id <> v_batch.student_id THEN
    RAISE EXCEPTION 'Seçilen haftalık akış bu öğrenciye ait değil.';
  END IF;

  IF v_flow.status <> 'active' THEN
    RAISE EXCEPTION 'Kapanmış bir haftalık akışa ödev taşınamaz.';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending',
      released_at = NULL,
      released_by_profile_id = NULL,
      release_reason = NULL,
      updated_at = NOW()
  WHERE hi.homework_batch_id = p_batch_id
    AND hi.status = 'cancelled'
    AND hi.carried_to_item_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = hi.student_book_assignment_id
        AND sba.status <> 'archived'
    );

  UPDATE public.homework_batches hb
  SET status         = 'active',
      weekly_flow_id = p_weekly_flow_id,
      due_date       = (v_flow.due_at AT TIME ZONE 'Europe/Istanbul')::DATE,
      due_at         = v_flow.due_at,
      updated_at     = NOW()
  WHERE hb.id = p_batch_id;
END;
$fn$;


-- ------------------------------------------------------------
-- 4) correct_finance_model_date (H04)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_finance_model_date(
  p_student_id UUID,
  p_old_from   DATE,
  p_new_from   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_merged    INT := 0;
  v_moved     INT := 0;
  v_current   INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Ücretlendirmeyi yalnız çalışma alanı sahibi değiştirebilir';
  END IF;
  IF p_old_from IS NULL OR p_new_from IS NULL THEN
    RAISE EXCEPTION 'Geçerlilik başlangıcını seçin';
  END IF;
  IF p_old_from = p_new_from THEN
    RETURN jsonb_build_object('moved', 0, 'merged', 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.student_finance_models
    WHERE student_id = p_student_id AND valid_from = p_old_from
  ) THEN
    RAISE EXCEPTION 'Düzeltilecek hizmet modeli sürümü bulunamadı';
  END IF;

  -- Yeni tarihte zaten bir sürüm varsa (eski hatanın açtığı satır) o
  -- kalır, eski tarihteki silinir: sonuç o tarihte TEK sürümdür.
  -- Ardından çağrılan set_finance_model değerleri bu satıra yazar.
  IF EXISTS (
    SELECT 1 FROM public.student_finance_models
    WHERE student_id = p_student_id AND valid_from = p_new_from
  ) THEN
    DELETE FROM public.student_finance_models
     WHERE student_id = p_student_id AND valid_from = p_old_from;
    v_merged := v_merged + 1;
  ELSE
    UPDATE public.student_finance_models
       SET valid_from = p_new_from
     WHERE student_id = p_student_id AND valid_from = p_old_from;
    v_moved := v_moved + 1;
  END IF;

  -- Fiyat sürümleri aynı kuralla (tür başına).
  DELETE FROM public.student_price_versions pv
   WHERE pv.student_id = p_student_id
     AND pv.valid_from = p_old_from
     AND EXISTS (
       SELECT 1 FROM public.student_price_versions x
       WHERE x.student_id = p_student_id
         AND x.price_type = pv.price_type
         AND x.valid_from = p_new_from
     );

  UPDATE public.student_price_versions
     SET valid_from = p_new_from
   WHERE student_id = p_student_id
     AND valid_from = p_old_from;

  -- 066'nın tek-fiyat alanı (add_price_version ile aynı eşitleme).
  v_current := public.price_at(p_student_id, 'ders_basi', CURRENT_DATE);
  IF v_current IS NOT NULL THEN
    INSERT INTO public.student_fees (student_id, workspace_id, per_lesson_kurus)
    VALUES (p_student_id, v_workspace, v_current)
    ON CONFLICT (student_id) DO UPDATE
      SET per_lesson_kurus = EXCLUDED.per_lesson_kurus;
  END IF;

  RETURN jsonb_build_object('moved', v_moved, 'merged', v_merged);
END;
$fn$;

REVOKE ALL ON FUNCTION public.correct_finance_model_date(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.correct_finance_model_date(UUID, DATE, DATE) TO authenticated;


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.correct_finance_model_date(UUID, DATE, DATE);
--   DROP FUNCTION IF EXISTS public.carry_homework_items(UUID[], TEXT);
--   -- restore_batch_to_active_load için 135 tanımını yeniden çalıştırın.
--   DROP INDEX IF EXISTS public.uq_homework_items_carried_from;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS carry_requested_at;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS carried_at;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS carried_from_item_id;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS carried_to_item_id;
-- ============================================================
