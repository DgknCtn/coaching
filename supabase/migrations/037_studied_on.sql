-- ============================================================
-- 037_studied_on  (R5.1 — R5.4 için erken temel)
--
-- SORUN
-- Sistemde ÇALIŞMANIN GERÇEKTEN YAPILDIĞI TARİH hiçbir yerde tutulmuyor.
-- İstisnasız tüm tarih alanları NOW() ile, yani aksiyonun sisteme
-- girildiği anla yazılıyor:
--
--   test_completions.completed_at = NOW()   (onay anı)
--   homework_items.submitted_at   = NOW()   (işaretleme anı)
--   homework_items.approved_at    = NOW()   (onay anı)
--
-- Şartname §6.2 bunun tersini istiyor: "Öğrenci 10 Ekim'de çalışıp
-- öğretmen 13 Ekim'de onayladıysa Son Temas = 10 Ekim. Onay gecikmesi
-- öğrencinin akademik zamanını yapay olarak yenilemez."
--
-- En kötüsü öğretmenin manuel tamamlaması (complete_units_manually,
-- 028): geçmişte yapılmış bir çalışma bugün işaretlenir ve tarih
-- SİSTEMATİK OLARAK yanlış olur.
--
-- NEDEN R5.4 YERİNE ŞİMDİ
-- Bu alan bugün eklenmezse, Koruma Havuzu paketi geldiğinde elde aylarca
-- birikmiş yanlış tarihli veri olur ve geriye dönük düzeltilemez. Alan
-- bugün eklenirse gerçek tarihler o pakete kadar birikmeye başlar.
-- Ekleme küçük, nullable ve geri alınabilir; UI değişikliği ZORUNLU
-- DEĞİLDİR (parametreler DEFAULT NULL).
--
-- VERİ AKIŞI
--   öğrenci "Onaya Gönder" -> homework_items.studied_on   (kim biliyorsa o girer)
--   öğretmen onaylar       -> test_completions.studied_on (kalemden taşınır)
--   öğretmen manuel tamamlar -> test_completions.studied_on (doğrudan girer)
--
-- OKUMA KURALI (her yerde aynı):
--   COALESCE(studied_on, completed_at::date)
-- Eski kayıtlarda studied_on NULL'dır ve onay tarihine düşülür; bu, veri
-- eklenmeden önceki dönem için bilinen ve kabul edilen bir yaklaşımdır.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) Kolonlar
-- ============================================================
ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS studied_on DATE;

ALTER TABLE public.test_completions
  ADD COLUMN IF NOT EXISTS studied_on DATE;

COMMENT ON COLUMN public.test_completions.studied_on IS
  'R5.1: çalışmanın GERÇEKTEN yapıldığı gün. completed_at onay anıdır ve '
  'bu alanın yerine geçmez. Okurken COALESCE(studied_on, completed_at::date).';

COMMENT ON COLUMN public.homework_items.studied_on IS
  'R5.1: öğrencinin çalışmayı yaptığını beyan ettiği gün. Onay anında '
  'test_completions.studied_on alanına taşınır.';

-- Koruma Havuzu "son temas" sorgusu bu sıralamayı kullanacak.
CREATE INDEX IF NOT EXISTS idx_test_completions_studied_on
  ON public.test_completions (student_id, studied_on DESC)
  WHERE status = 'active';

-- ============================================================
-- 2) Gelecek tarih koruması
--
-- Çalışma tarihi geleceğe yazılamaz; geçmişe yazılabilir (asıl amaç bu).
-- ============================================================
ALTER TABLE public.homework_items DROP CONSTRAINT IF EXISTS homework_items_studied_on_chk;
ALTER TABLE public.homework_items
  ADD CONSTRAINT homework_items_studied_on_chk
  CHECK (studied_on IS NULL OR studied_on <= CURRENT_DATE + 1);

ALTER TABLE public.test_completions DROP CONSTRAINT IF EXISTS test_completions_studied_on_chk;
ALTER TABLE public.test_completions
  ADD CONSTRAINT test_completions_studied_on_chk
  CHECK (studied_on IS NULL OR studied_on <= CURRENT_DATE + 1);

-- ============================================================
-- 3) submit_homework_item_for_approval — p_studied_on
--
-- İmza değiştiği için önce eski imza düşürülür (021'in kendi kalıbı).
-- Gövde 014'teki ile birebir aynı; TEK fark studied_on'ın yazılması.
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_homework_item_for_approval(UUID);

CREATE OR REPLACE FUNCTION public.submit_homework_item_for_approval(
  p_homework_item_id UUID,
  p_studied_on       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev kaydı bulunamadı'; END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status = 'pending_approval' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'already_submitted', true);
  END IF;

  IF v_item.status != 'pending' THEN
    RAISE EXCEPTION 'Bu ödev onaya gönderilemez (mevcut durum: %)', v_item.status;
  END IF;

  UPDATE public.homework_items
  SET status = 'pending_approval', submitted_at = NOW(), submitted_by_profile_id = v_profile_id,
      studied_on = COALESCE(p_studied_on, studied_on),
      rejected_at = NULL, teacher_note = NULL
  WHERE id = p_homework_item_id;

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'submitted', true);
END;
$fn$;

-- ============================================================
-- 4) submit_homework_items_bulk — p_studied_on
--
-- 020'deki gövde korunur; tek fark studied_on.
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_homework_items_bulk(UUID, UUID);

CREATE OR REPLACE FUNCTION public.submit_homework_items_bulk(
  p_homework_batch_id UUID,
  p_book_id           UUID DEFAULT NULL,
  p_studied_on        DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id  UUID;
  v_batch       public.homework_batches%ROWTYPE;
  v_count       INT;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_homework_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev grubu bulunamadı'; END IF;

  IF NOT (
    public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending_approval',
      submitted_at = NOW(),
      submitted_by_profile_id = v_profile_id,
      studied_on = COALESCE(p_studied_on, hi.studied_on),
      rejected_at = NULL,
      teacher_note = NULL
  WHERE hi.homework_batch_id = p_homework_batch_id
    AND hi.status = 'pending'
    AND (p_book_id IS NULL OR hi.book_id = p_book_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Dönüş şekli 020'deki ile BİREBİR aynı tutulur; çağıranlar bu
  -- anahtarları okuyor olabilir.
  RETURN jsonb_build_object(
    'homework_batch_id', p_homework_batch_id,
    'book_id', p_book_id,
    'submitted_count', v_count
  );
END;
$fn$;

-- ============================================================
-- 5) approve_homework_item — kalemden taşı
--
-- Onaylarken tarih ÖĞRENCİNİN BEYANINDAN gelir; öğretmen isterse
-- p_studied_on ile düzeltebilir. Hiçbiri yoksa onay günü kullanılır.
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_homework_item(UUID);

CREATE OR REPLACE FUNCTION public.approve_homework_item(
  p_homework_item_id UUID,
  p_studied_on       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
  v_studied_on  DATE;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev kaydı bulunamadı'; END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_item.status = 'completed' THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'already_completed', true);
  END IF;

  IF v_item.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Bu ödev onaylanamaz (mevcut durum: %)', v_item.status;
  END IF;

  -- Öncelik: öğretmenin düzeltmesi > öğrencinin beyanı > onay günü.
  v_studied_on := COALESCE(p_studied_on, v_item.studied_on, public.today_local());

  UPDATE public.homework_items
  SET status = 'completed', approved_at = NOW(), approved_by_profile_id = v_profile_id,
      completed_at = NOW(), completed_by_profile_id = v_profile_id,
      studied_on = v_studied_on
  WHERE id = p_homework_item_id;

  INSERT INTO public.test_completions (
    workspace_id, academic_term_id, student_id,
    student_book_assignment_id, book_test_id,
    completed_at, completed_by_profile_id, studied_on,
    source, source_homework_item_id, status
  ) VALUES (
    v_item.workspace_id,
    v_batch.academic_term_id,
    v_batch.student_id,
    v_item.student_book_assignment_id,
    v_item.book_test_id,
    NOW(),
    v_profile_id,
    v_studied_on,
    'homework',
    p_homework_item_id,
    'active'
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'approved', true);
END;
$fn$;

-- ============================================================
-- 6) approve_homework_items_bulk — kalem kalem taşı
--
-- 020'deki tek ifadeli UPDATE ... RETURNING -> INSERT deseni korunur;
-- studied_on her kalemin KENDİ beyanından gelir (toplu onayda tek bir
-- tarihi hepsine dayatmak yanlış olurdu).
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_homework_items_bulk(UUID, UUID);

CREATE OR REPLACE FUNCTION public.approve_homework_items_bulk(
  p_homework_batch_id UUID,
  p_book_id           UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_batch      public.homework_batches%ROWTYPE;
  v_count      INT;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_homework_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev grubu bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH upd AS (
    UPDATE public.homework_items hi
    SET status = 'completed',
        approved_at = NOW(),
        approved_by_profile_id = v_profile_id,
        completed_at = NOW(),
        completed_by_profile_id = v_profile_id,
        studied_on = COALESCE(hi.studied_on, public.today_local())
    WHERE hi.homework_batch_id = p_homework_batch_id
      AND hi.status = 'pending_approval'
      AND (p_book_id IS NULL OR hi.book_id = p_book_id)
    RETURNING hi.id, hi.workspace_id, hi.student_book_assignment_id,
              hi.book_test_id, hi.studied_on
  ),
  ins AS (
    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id, studied_on,
      source, source_homework_item_id, status
    )
    SELECT
      u.workspace_id, v_batch.academic_term_id, v_batch.student_id,
      u.student_book_assignment_id, u.book_test_id,
      NOW(), v_profile_id, u.studied_on,
      'homework', u.id, 'active'
    FROM upd u
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  -- Dönüş şekli 020'deki ile BİREBİR aynı.
  RETURN jsonb_build_object(
    'homework_batch_id', p_homework_batch_id,
    'book_id', p_book_id,
    'approved_count', v_count
  );
END;
$fn$;

-- ============================================================
-- 7) approve_selected_homework_items — kalem kalem taşı
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_selected_homework_items(UUID[]);

CREATE OR REPLACE FUNCTION public.approve_selected_homework_items(
  p_homework_item_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_approved   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF p_homework_item_ids IS NULL OR array_length(p_homework_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('approved', 0);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.homework_items hi
    WHERE hi.id = ANY(p_homework_item_ids)
      AND NOT public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH upd AS (
    UPDATE public.homework_items hi
    SET status = 'completed',
        approved_at = NOW(),
        approved_by_profile_id = v_profile_id,
        completed_at = NOW(),
        completed_by_profile_id = v_profile_id,
        studied_on = COALESCE(hi.studied_on, public.today_local())
    WHERE hi.id = ANY(p_homework_item_ids)
      AND hi.status = 'pending_approval'
    RETURNING hi.id, hi.workspace_id, hi.homework_batch_id,
              hi.student_book_assignment_id, hi.book_test_id, hi.studied_on
  ),
  ins AS (
    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id, studied_on,
      source, source_homework_item_id, status
    )
    SELECT
      u.workspace_id, hb.academic_term_id, hb.student_id,
      u.student_book_assignment_id, u.book_test_id,
      NOW(), v_profile_id, u.studied_on,
      'homework', u.id, 'active'
    FROM upd u
    JOIN public.homework_batches hb ON hb.id = u.homework_batch_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_approved FROM upd;

  RETURN jsonb_build_object('approved', v_approved);
END;
$fn$;

-- ============================================================
-- 8) complete_units_manually / approve_units_bulk — p_studied_on
--
-- Manuel tamamlama bu alanın EN ÇOK gerektiği yer: öğretmen "bunları
-- geçen ay bitirmişti" derken tarih bugüne yazılıyordu.
-- ============================================================
DROP FUNCTION IF EXISTS public.complete_units_manually(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.complete_units_manually(
  p_student_book_assignment_id UUID,
  p_book_test_ids              UUID[],
  p_studied_on                 DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id   UUID;
  v_sba          public.student_book_assignments%ROWTYPE;
  v_test_id      UUID;
  v_item         public.homework_items%ROWTYPE;
  v_studied_on   DATE;
  v_completed    INT := 0;
  v_skipped      INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();
  v_studied_on := COALESCE(p_studied_on, public.today_local());

  SELECT * INTO v_sba
  FROM public.student_book_assignments
  WHERE id = p_student_book_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_sba.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOREACH v_test_id IN ARRAY COALESCE(p_book_test_ids, ARRAY[]::UUID[])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.book_tests bt
      WHERE bt.id = v_test_id AND bt.book_id = v_sba.book_id
    ) THEN
      RAISE EXCEPTION 'Birim bu kitaba ait değil';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.test_completions tc
      WHERE tc.student_book_assignment_id = p_student_book_assignment_id
        AND tc.book_test_id = v_test_id
        AND tc.status = 'active'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT hi.* INTO v_item
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.student_book_assignment_id = p_student_book_assignment_id
      AND hi.book_test_id = v_test_id
      AND hi.status IN ('pending', 'pending_approval')
      AND hb.status = 'active'
    ORDER BY hb.due_date DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.homework_items
      SET status = 'completed',
          completed_at = NOW(),
          completed_by_profile_id = v_profile_id,
          approved_at = NOW(),
          approved_by_profile_id = v_profile_id,
          studied_on = v_studied_on,
          rejected_at = NULL,
          teacher_note = NULL
      WHERE id = v_item.id;

      INSERT INTO public.test_completions (
        workspace_id, academic_term_id, student_id,
        student_book_assignment_id, book_test_id,
        completed_at, completed_by_profile_id, studied_on,
        source, source_homework_item_id, status
      ) VALUES (
        v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
        p_student_book_assignment_id, v_test_id,
        NOW(), v_profile_id, v_studied_on,
        'teacher_manual', v_item.id, 'active'
      )
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO public.test_completions (
        workspace_id, academic_term_id, student_id,
        student_book_assignment_id, book_test_id,
        completed_at, completed_by_profile_id, studied_on,
        source, source_homework_item_id, status
      ) VALUES (
        v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
        p_student_book_assignment_id, v_test_id,
        NOW(), v_profile_id, v_studied_on,
        'teacher_manual', NULL, 'active'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    v_completed := v_completed + 1;
  END LOOP;

  RETURN jsonb_build_object('completed', v_completed, 'skipped', v_skipped);
END;
$fn$;

DROP FUNCTION IF EXISTS public.approve_units_bulk(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.approve_units_bulk(
  p_student_book_assignment_id UUID,
  p_book_test_ids              UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_sba        public.student_book_assignments%ROWTYPE;
  v_approved   INT := 0;
  v_item       RECORD;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_sba
  FROM public.student_book_assignments
  WHERE id = p_student_book_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_sba.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOR v_item IN
    SELECT hi.id, hi.book_test_id,
           COALESCE(hi.studied_on, public.today_local()) AS studied_on
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.student_book_assignment_id = p_student_book_assignment_id
      AND hi.book_test_id = ANY(COALESCE(p_book_test_ids, ARRAY[]::UUID[]))
      AND hi.status = 'pending_approval'
      AND hb.status = 'active'
  LOOP
    UPDATE public.homework_items
    SET status = 'completed',
        approved_at = NOW(), approved_by_profile_id = v_profile_id,
        completed_at = NOW(), completed_by_profile_id = v_profile_id,
        studied_on = v_item.studied_on
    WHERE id = v_item.id;

    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id, studied_on,
      source, source_homework_item_id, status
    ) VALUES (
      v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
      p_student_book_assignment_id, v_item.book_test_id,
      NOW(), v_profile_id, v_item.studied_on,
      'homework', v_item.id, 'active'
    )
    ON CONFLICT DO NOTHING;

    v_approved := v_approved + 1;
  END LOOP;

  RETURN jsonb_build_object('approved', v_approved);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
-- Fonksiyonlar için: aşağıdaki yeni imzaları düşürüp ilgili migration'daki
-- ESKİ tanımı yeniden çalıştırın.
--
--   DROP FUNCTION IF EXISTS public.submit_homework_item_for_approval(UUID, DATE);   -- 014
--   DROP FUNCTION IF EXISTS public.submit_homework_items_bulk(UUID, UUID, DATE);    -- 020
--   DROP FUNCTION IF EXISTS public.approve_homework_item(UUID, DATE);               -- 014
--   -- approve_homework_items_bulk / approve_selected_homework_items /
--   -- complete_units_manually / approve_units_bulk imzaları DEĞİŞMEDİ;
--   -- yalnız gövdeleri güncellendi. Onlar için 020 / 032 / 028'deki
--   -- tanımları yeniden çalıştırmak yeterlidir.
--
--   ALTER TABLE public.test_completions DROP CONSTRAINT IF EXISTS test_completions_studied_on_chk;
--   ALTER TABLE public.homework_items   DROP CONSTRAINT IF EXISTS homework_items_studied_on_chk;
--   DROP INDEX IF EXISTS public.idx_test_completions_studied_on;
--   ALTER TABLE public.test_completions DROP COLUMN IF EXISTS studied_on;
--   ALTER TABLE public.homework_items   DROP COLUMN IF EXISTS studied_on;
--
-- Geri alma hiçbir tamamlanma kaydını silmez; yalnız gerçek çalışma
-- tarihi bilgisi kaybolur ve okuma completed_at'e döner.
-- ============================================================
