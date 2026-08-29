-- ============================================================
-- 029_interim_targets  (R6-04)
--
-- Üç ayrı kavram bugüne dek tek yapı gibi davranıyordu:
--
--   Kaynak Hedefi    nihai kapsam + nihai tarih   (uzun vadeli)
--   Ara Hedef        kısa menzil, değiştirilebilir
--   Bu Haftanın Planı yayınlanan gerçek çalışma   (homework_batches)
--
-- Sonuç: kısa dönem hedef tarihi değiştirildiğinde ANA tempo da onunla
-- birlikte kayıyordu. R6-04 bunu ayırıyor; ana tempo HER ZAMAN Kaynak
-- Hedefi üzerinden hesaplanmalı.
--
-- ŞEMA ZATEN HAZIRDI. 022 hedefleri bilinçli olarak ayrı SATIRLAR halinde
-- modellemiş ("ileride ardışık hedefler eklenirse şema hazır olsun"); tek
-- kısıt uniq_active_student_book_target kısmi indeksinin atama başına tek
-- aktif satıra izin vermesiydi. Yaptığımız, o kısıta bir boyut eklemek.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. kind kolonu DEFAULT ile
-- eklendiği için mevcut satırların tamamı 'resource' olur; hiçbir hedef
-- kaybolmaz ve geri alındığında yalnız ara hedefler (varsa) pasifleşir.
-- ============================================================

-- ============================================================
-- 1) kind kolonu
--
-- resource — Kaynak Hedefi: nihai kapsam ve tarih. Ana tempo bundan gelir.
-- interim  — Ara Hedef: kendi tarihini ve kapsamını tutar, Kaynak Hedefini
--            ASLA değiştirmez.
-- ============================================================
ALTER TABLE public.student_book_targets
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'resource';

ALTER TABLE public.student_book_targets
  DROP CONSTRAINT IF EXISTS student_book_targets_kind_check;
ALTER TABLE public.student_book_targets
  ADD CONSTRAINT student_book_targets_kind_check
  CHECK (kind IN ('resource', 'interim'));

-- ============================================================
-- 2) Tek aktif hedef -> tür başına tek aktif hedef
--
-- Eski indeks atama başına TEK aktif satıra izin veriyordu; artık aynı
-- atamada bir Kaynak Hedefi ve bir Ara Hedef aynı anda aktif olabilir,
-- ama her türden yalnız BİR tane.
-- ============================================================
DROP INDEX IF EXISTS public.uniq_active_student_book_target;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_student_book_target
  ON public.student_book_targets (student_book_assignment_id, kind)
  WHERE active;

-- ============================================================
-- 3) set_student_book_target — p_kind parametresi
--
-- 022'deki gövdenin aynısı; İKİ fark var:
--
--   a) Pasifleştirme artık yalnız AYNI TÜRDEKİ aktif hedefi kapatır.
--      Ara hedef kaydetmek Kaynak Hedefini pasife almaz.
--
--   b) KRİTİK: student_book_assignments.start_date / target_end_date
--      senkronu YALNIZ kind='resource' için çalışır.
--
--      022 bu senkronu bilinçli yapıyordu (view'lar ve TempoStrip oradan
--      okuyor). Ama ara hedef de aynı senkronu yapsaydı, kısa menzilli bir
--      tarih ana hedefin tarihini EZERDİ — R6-04'ün düzeltmek için var
--      olduğu hatanın ta kendisi. Kabul testi #31 tam bunu ölçüyor:
--      "Kaynak Hedefi 614 sayfa / 01.06.2027 iken Ara Hedef tarihi
--       15.09.2026 yapılınca ana hedef tarihi değişmemeli."
--
-- p_kind sona ve DEFAULT ile eklendi; mevcut çağrılar (target-actions.ts)
-- imzayı değiştirmeden çalışmaya devam eder.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_student_book_target(
  p_assignment_id UUID,
  p_start_date    DATE,
  p_target_date   DATE,
  p_scope_type    TEXT DEFAULT 'whole_book',
  p_scope_data    JSONB DEFAULT '{}'::JSONB,
  p_kind          TEXT DEFAULT 'resource'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_profile_id   UUID;
  v_target_id    UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_scope_type NOT IN ('whole_book', 'sections', 'units') THEN
    RAISE EXCEPTION 'Geçersiz hedef kapsamı';
  END IF;

  IF p_kind NOT IN ('resource', 'interim') THEN
    RAISE EXCEPTION 'Geçersiz hedef türü';
  END IF;

  IF p_start_date IS NOT NULL AND p_target_date IS NOT NULL AND p_target_date < p_start_date THEN
    RAISE EXCEPTION 'Hedef tarihi başlangıçtan önce olamaz';
  END IF;

  -- Yalnız aynı türdeki aktif hedef pasife alınır.
  UPDATE public.student_book_targets
  SET active = FALSE, updated_at = NOW()
  WHERE student_book_assignment_id = p_assignment_id
    AND kind = p_kind
    AND active;

  INSERT INTO public.student_book_targets (
    workspace_id, student_book_assignment_id, start_date, target_date,
    scope_type, scope_data, kind, active, created_by_profile_id
  ) VALUES (
    v_workspace_id, p_assignment_id, p_start_date, p_target_date,
    p_scope_type, COALESCE(p_scope_data, '{}'::JSONB), p_kind, TRUE, v_profile_id
  ) RETURNING id INTO v_target_id;

  -- Ana hedef tarihleri yalnız Kaynak Hedefinden gelir.
  IF p_kind = 'resource' THEN
    UPDATE public.student_book_assignments
    SET start_date = p_start_date, target_end_date = p_target_date, updated_at = NOW()
    WHERE id = p_assignment_id;
  END IF;

  RETURN jsonb_build_object('target_id', v_target_id, 'kind', p_kind);
END;
$fn$;

-- ============================================================
-- 4) clear_student_book_target
--
-- Ara Hedef geçici bir araçtır; kaldırılabilmelidir. Kaynak Hedefi de
-- temizlenebilir ama o durumda atamanın tarihleri de boşaltılır ki plan
-- matematiği "hedef yok" haline dönsün (calculatePlanPace: 'no_target').
--
-- Geçmiş hedefler SİLİNMEZ, yalnız pasife alınır — 022'nin "pasif hedefler
-- geçmiş olarak kalır" kuralı korunur.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clear_student_book_target(
  p_assignment_id UUID,
  p_kind          TEXT DEFAULT 'interim'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_cleared      INT;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_kind NOT IN ('resource', 'interim') THEN
    RAISE EXCEPTION 'Geçersiz hedef türü';
  END IF;

  WITH cleared AS (
    UPDATE public.student_book_targets
    SET active = FALSE, updated_at = NOW()
    WHERE student_book_assignment_id = p_assignment_id
      AND kind = p_kind
      AND active
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleared FROM cleared;

  IF p_kind = 'resource' THEN
    UPDATE public.student_book_assignments
    SET start_date = NULL, target_end_date = NULL, updated_at = NOW()
    WHERE id = p_assignment_id;
  END IF;

  RETURN jsonb_build_object('cleared', v_cleared);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   -- Ara hedefler pasife alınır (silinmez, geçmiş olarak kalır):
--   UPDATE public.student_book_targets SET active = FALSE
--   WHERE kind = 'interim' AND active;
--
--   DROP INDEX IF EXISTS public.uniq_active_student_book_target;
--   CREATE UNIQUE INDEX uniq_active_student_book_target
--     ON public.student_book_targets (student_book_assignment_id) WHERE active;
--
--   ALTER TABLE public.student_book_targets
--     DROP CONSTRAINT IF EXISTS student_book_targets_kind_check;
--   ALTER TABLE public.student_book_targets DROP COLUMN IF EXISTS kind;
--
--   DROP FUNCTION IF EXISTS public.clear_student_book_target(UUID, TEXT);
--   -- set_student_book_target için 022'deki tanımı yeniden çalıştırın.
-- ============================================================
