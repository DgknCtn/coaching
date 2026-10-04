-- ============================================================
-- 135 — YAYINLANAN ÖDEVLER: KALEM BAZLI TOPLU İŞLEM (M1.0-01 §4, §6)
--
-- "Aktif Yükten Çıkar" yalnız PARTİ düzeyindeydi (097). Sağ panelde
-- öğretmen ödevin çalışmalarını tek tek seçip üç işlemden birini yapar:
--
--   ONAYLA            — öğrenci teslim etmiş (pending_approval). Mevcut
--                       approve_selected_homework_items (032/037) kullanılır.
--   TAMAMLANDI İŞARETLE — öğrenci panelden teslim ETMEMİŞ (pending) ama
--                       öğretmen işi derste/fiziksel doğrulamış. Yeni:
--                       complete_homework_items_manually. Kaynak
--                       test_completions.source = 'teacher_manual'
--                       (= dokümanın completion_source = teacher'ı);
--                       submitted_at BOŞ KALIR — öğrenci teslimiymiş gibi
--                       geçmiş uydurulmaz (§6). Onay bekleyen kalem bu
--                       yoldan geçmez: öğrencinin teslimi, öğretmen
--                       kaynağıyla EZİLMEZ; onun yolu ONAYLA'dır.
--   AKTİF YÜKTEN ÇIKAR — öğretmen çalışmayı güncel sorumlulukta istemiyor.
--                       Yeni: release_homework_items. Kalem silinmez,
--                       'cancelled' olur; NEDEN / KİM / NE ZAMAN kalemin
--                       kendisinde tutulur (released_*). 097 bu bilgiyi
--                       yalnız audit_events'e bırakmıştı; kalem bazlı
--                       çıkarmada "bu çalışma neden düştü?" sorusu satırın
--                       kendisinden yanıtlanabilmeli.
--
-- PARTİ SEMANTİĞİ KORUNUR (097): partideki bütün açık kalemler çıktıysa
-- parti 'archived' olur ve "Aktif yükten çıkarılanlar" bloğuna iner.
--
-- 097'NİN İKİ FONKSİYONU GÜNCELLENİR:
--   release_batch_from_active_load — released_* alanlarını da yazar.
--   restore_batch_to_active_load   — released_* alanlarını temizler,
--     due_at'i de akıştan miras alır (132) ve ARŞİVLENMİŞ KAYNAĞIN
--     kalemlerini geri açmaz (133: arşivlenen kaynak yeni yük doğurmaz).
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS released_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS release_reason TEXT CHECK (release_reason IS NULL OR length(release_reason) <= 500);

COMMENT ON COLUMN public.homework_items.released_at IS
  'Aktif yükten çıkarılma anı (M1.0-01). status=cancelled ile birlikte; geri alınınca NULL.';

-- ============================================================
-- release_homework_items
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_homework_items(
  p_item_ids UUID[],
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_released   INT := 0;
  v_archived   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('released', 0, 'archived_batches', 0);
  END IF;

  -- Yetki tek tek (097 ile aynı gerekçe: dizi yabancı id taşıyabilir).
  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    WHERE hi.id = ANY(p_item_ids)
      AND NOT public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  -- Yalnız AÇIK kalemler; tamamlanan kalem aktif yükte değildir.
  UPDATE public.homework_items hi
     SET status = 'cancelled',
         released_at = NOW(),
         released_by_profile_id = v_profile_id,
         release_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         updated_at = NOW()
   WHERE hi.id = ANY(p_item_ids)
     AND hi.status IN ('pending', 'pending_approval');
  GET DIAGNOSTICS v_released = ROW_COUNT;

  -- Açık kalemi kalmayan aktif parti arşive iner.
  UPDATE public.homework_batches hb
     SET status = 'archived', updated_at = NOW()
   WHERE hb.status = 'active'
     AND hb.id IN (SELECT homework_batch_id FROM public.homework_items WHERE id = ANY(p_item_ids))
     AND NOT EXISTS (
       SELECT 1 FROM public.homework_items hi
       WHERE hi.homework_batch_id = hb.id
         AND hi.status IN ('pending', 'pending_approval')
     );
  GET DIAGNOSTICS v_archived = ROW_COUNT;

  RETURN jsonb_build_object('released', v_released, 'archived_batches', v_archived);
END;
$fn$;

REVOKE ALL ON FUNCTION public.release_homework_items(UUID[], TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.release_homework_items(UUID[], TEXT) TO authenticated;

-- ============================================================
-- complete_homework_items_manually
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_homework_items_manually(
  p_item_ids   UUID[],
  p_studied_on DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_studied_on DATE;
  v_completed  INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();
  v_studied_on := COALESCE(p_studied_on, public.today_local());

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('completed', 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    WHERE hi.id = ANY(p_item_ids)
      AND NOT public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  -- YALNIZ 'pending': öğrencinin teslim ettiği (pending_approval) kalem
  -- öğretmen kaynağıyla ezilmez. submitted_at'e DOKUNULMAZ (NULL kalır).
  WITH upd AS (
    UPDATE public.homework_items hi
       SET status = 'completed',
           completed_at = NOW(),
           completed_by_profile_id = v_profile_id,
           approved_at = NOW(),
           approved_by_profile_id = v_profile_id,
           studied_on = v_studied_on,
           rejected_at = NULL,
           teacher_note = NULL,
           updated_at = NOW()
      FROM public.homework_batches hb
     WHERE hb.id = hi.homework_batch_id
       AND hb.status = 'active'
       AND hi.id = ANY(p_item_ids)
       AND hi.status = 'pending'
    RETURNING hi.id, hi.workspace_id, hi.student_book_assignment_id, hi.book_test_id,
              hb.academic_term_id, hb.student_id
  ),
  ins AS (
    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id, studied_on,
      source, source_homework_item_id, status
    )
    SELECT
      u.workspace_id, u.academic_term_id, u.student_id,
      u.student_book_assignment_id, u.book_test_id,
      NOW(), v_profile_id, v_studied_on,
      'teacher_manual', u.id, 'active'
    FROM upd u
    -- Aynı birim için zaten aktif bir tamamlama varsa (tekil indeks)
    -- ikincisi yazılmaz; ilerleme iki kez sayılmaz.
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_completed FROM upd;

  RETURN jsonb_build_object('completed', v_completed);
END;
$fn$;

REVOKE ALL ON FUNCTION public.complete_homework_items_manually(UUID[], DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_homework_items_manually(UUID[], DATE) TO authenticated;

-- ============================================================
-- release_batch_from_active_load — released_* (097 gövdesi + iz)
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_batch_from_active_load(
  p_batch_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_released INTEGER := 0;
BEGIN
  IF p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.homework_batches hb
    WHERE hb.id = ANY(p_batch_ids)
      AND NOT public.has_workspace_role(hb.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'cancelled',
      released_at = NOW(),
      released_by_profile_id = public.current_profile_id(),
      updated_at = NOW()
  WHERE hi.homework_batch_id = ANY(p_batch_ids)
    AND hi.status IN ('pending', 'pending_approval');

  UPDATE public.homework_batches hb
  SET status = 'archived', updated_at = NOW()
  WHERE hb.id = ANY(p_batch_ids)
    AND hb.status = 'active';

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$fn$;

-- ============================================================
-- restore_batch_to_active_load — released_* temizlenir, due_at miras,
-- arşivlenmiş kaynağın kalemleri açılmaz (097 gövdesi + üç fark)
-- ============================================================
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

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.complete_homework_items_manually(UUID[], DATE);
--   DROP FUNCTION IF EXISTS public.release_homework_items(UUID[], TEXT);
--   -- release_batch_from_active_load ve restore_batch_to_active_load için
--   -- 097_active_load_and_student_week.sql tanımlarını yeniden çalıştırın.
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS release_reason;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS released_by_profile_id;
--   ALTER TABLE public.homework_items DROP COLUMN IF EXISTS released_at;
-- ============================================================
