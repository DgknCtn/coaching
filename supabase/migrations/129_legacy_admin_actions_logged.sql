-- ============================================================
-- 129 — PARA VE ERİŞİM ETKİLEYEN ESKİ YÖNETİM İŞLEMLERİ KAYDA GİRİYOR
--
-- Kullanıcı kararı (28 Eylül 2026): para ya da erişim etkileyen eski
-- işlemler de gerekçe ister ve 128'deki değiştirilemez yönetim kaydına
-- yazılır. Destek yanıtları rutin iş; talep geçmişi zaten tutuluyor —
-- kayda girmez.
--
--   admin_update_partner         komisyon oranı / durum (067)
--   admin_mark_commissions_paid  hakedişi ödendi say (060)
--   approve_book_for_library     kütüphaneye yayın (069)
--   reject_book_for_library      öneriyi reddet (069) — koça giden not
--                                (p_note) isteğe bağlı kalır; kayda giden
--                                gerekçe (p_reason) ayrı ve zorunlu.
--
-- İMZA DEĞİŞİYOR: eski imzalar DÜŞÜRÜLÜYOR ki kaydı atlayan bir yol
-- kalmasın. SIRALAMA: bu migration, admin-merkez dalı canlıya çıktığı
-- anda uygulanmalı. Önce uygulanırsa canlıdaki eski arayüzün partner ve
-- kütüphane işlemleri "fonksiyon bulunamadı" hatası verir; sonra
-- uygulanırsa yeni arayüzün bu işlemleri aynı hatayı verir.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_update_partner(UUID, NUMERIC, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_mark_commissions_paid(UUID);
DROP FUNCTION IF EXISTS public.approve_book_for_library(UUID);
DROP FUNCTION IF EXISTS public.reject_book_for_library(UUID, TEXT);


-- ------------------------------------------------------------
-- Partner güncelleme (067 gövdesi + gerekçe + kayıt)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_partner(
  p_partner_id      UUID,
  p_reason          TEXT,
  p_commission_rate NUMERIC DEFAULT NULL,
  p_status          TEXT DEFAULT NULL,
  p_name            TEXT DEFAULT NULL,
  p_email           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_old public.partners%ROWTYPE;
  v_new public.partners%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  IF p_commission_rate IS NOT NULL
     AND (p_commission_rate < 0 OR p_commission_rate > 1) THEN
    RAISE EXCEPTION 'Komisyon oranı 0 ile 1 arasında olmalı';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;

  SELECT * INTO v_old FROM public.partners WHERE id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner bulunamadı';
  END IF;

  UPDATE public.partners
  SET commission_rate = COALESCE(p_commission_rate, commission_rate),
      status          = COALESCE(p_status, status),
      name            = COALESCE(NULLIF(TRIM(p_name), ''), name),
      email           = CASE WHEN p_email IS NULL THEN email
                             ELSE NULLIF(TRIM(p_email), '') END,
      updated_at      = NOW()
  WHERE id = p_partner_id
  RETURNING * INTO v_new;

  PERFORM public.record_admin_action(
    'partner.update', NULL, p_partner_id, p_reason,
    jsonb_build_object('partner', v_old.name, 'commission_rate', v_old.commission_rate, 'status', v_old.status),
    jsonb_build_object('partner', v_new.name, 'commission_rate', v_new.commission_rate, 'status', v_new.status)
  );

  RETURN jsonb_build_object('partner_id', p_partner_id, 'commission_rate', v_new.commission_rate);
END;
$fn$;


-- ------------------------------------------------------------
-- Hakedişi ödendi say (060 gövdesi + gerekçe + kayıt)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mark_commissions_paid(p_partner_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count INTEGER;
  v_kurus BIGINT;
  v_name  TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT name INTO v_name FROM public.partners WHERE id = p_partner_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Partner bulunamadı';
  END IF;

  WITH marked AS (
    UPDATE public.partner_commissions
    SET status = 'paid', paid_at = NOW(), updated_at = NOW()
    WHERE partner_id = p_partner_id AND status IN ('pending', 'approved')
    RETURNING commission_kurus
  )
  SELECT COUNT(*), COALESCE(SUM(commission_kurus), 0) INTO v_count, v_kurus FROM marked;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Ödenmemiş hakediş yok.';
  END IF;

  PERFORM public.record_admin_action(
    'partner.commissions_paid', NULL, p_partner_id, p_reason,
    jsonb_build_object('partner', v_name, 'status', 'pending'),
    jsonb_build_object('partner', v_name, 'status', 'paid', 'marked', v_count, 'commission_kurus', v_kurus)
  );

  RETURN jsonb_build_object('marked', v_count, 'commission_kurus', v_kurus);
END;
$fn$;


-- ------------------------------------------------------------
-- Kütüphane: onay (069 gövdesi + gerekçe + kayıt)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_book_for_library(p_book_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src        public.books%ROWTYPE;
  v_library_ws UUID;
  v_new_id     UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF v_src.library_status <> 'pending' THEN
    RAISE EXCEPTION 'Yalnız değerlendirmedeki öneriler onaylanabilir';
  END IF;

  SELECT id INTO v_library_ws FROM public.workspaces WHERE is_library LIMIT 1;
  IF v_library_ws IS NULL THEN
    RAISE EXCEPTION 'Kütüphane çalışma alanı tanımlı değil';
  END IF;

  v_new_id := public._copy_book_tree(
    p_book_id             => p_book_id,
    p_target_workspace_id => v_library_ws,
    p_term_id             => NULL,
    p_title               => NULL,
    p_edition_year        => NULL,
    p_library_source      => NULL,
    p_library_status      => 'approved'
  );

  UPDATE public.books
  SET library_status = 'approved',
      library_source_book_id = v_new_id,
      library_review_note = NULL,
      updated_at = NOW()
  WHERE id = p_book_id;

  PERFORM public.record_admin_action(
    'library.approve', v_src.workspace_id, p_book_id, p_reason,
    jsonb_build_object('title', v_src.title, 'status', 'pending'),
    jsonb_build_object('title', v_src.title, 'status', 'approved')
  );

  RETURN jsonb_build_object('library_book_id', v_new_id);
END;
$fn$;


-- ------------------------------------------------------------
-- Kütüphane: red (069 gövdesi + gerekçe + kayıt; koça not ayrı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_book_for_library(
  p_book_id UUID,
  p_reason  TEXT,
  p_note    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src public.books%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF v_src.library_status <> 'pending' THEN
    RAISE EXCEPTION 'Yalnız değerlendirmedeki öneriler reddedilebilir';
  END IF;

  UPDATE public.books
  SET library_status = 'rejected',
      library_review_note = NULLIF(TRIM(COALESCE(p_note, '')), ''),
      updated_at = NOW()
  WHERE id = p_book_id;

  PERFORM public.record_admin_action(
    'library.reject', v_src.workspace_id, p_book_id, p_reason,
    jsonb_build_object('title', v_src.title, 'status', 'pending'),
    jsonb_build_object('title', v_src.title, 'status', 'rejected')
  );

  RETURN jsonb_build_object('book_id', p_book_id, 'library_status', 'rejected');
END;
$fn$;


DO $yetki$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_update_partner(uuid,text,numeric,text,text,text)',
    'admin_mark_commissions_paid(uuid,text)',
    'approve_book_for_library(uuid,text)',
    'reject_book_for_library(uuid,text,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_fn);
    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '129 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%record_admin_action%' THEN
      RAISE EXCEPTION '129 DOĞRULAMA: % yönetim kaydına yazmıyor.', v_fn;
    END IF;
  END LOOP;

  -- Kaydı atlayan eski imzalar gerçekten gitti mi?
  IF to_regprocedure('public.admin_mark_commissions_paid(uuid)') IS NOT NULL
     OR to_regprocedure('public.approve_book_for_library(uuid)') IS NOT NULL
     OR to_regprocedure('public.admin_update_partner(uuid,numeric,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION '129 DOĞRULAMA: kaydı atlayan eski imza duruyor.';
  END IF;
  RAISE NOTICE '129: partner ve kütüphane işlemleri gerekçeyle yönetim kaydında.';
END;
$yetki$;

-- ROLLBACK: 060/067/069'daki imza ve gövdeler (DROP yeni imzalar + CREATE eskiler).
