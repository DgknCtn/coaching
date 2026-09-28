-- ============================================================
-- 128 — YÖNETİM İŞLEMLERİ VE DEĞİŞTİRİLEMEZ YÖNETİM KAYDI
--
-- Panel bugüne kadar yalnız okuyordu; deneme uzatmak ya da bir alanı
-- askıya almak SQL Editor'de, iz bırakmadan yapılıyordu. audit_events
-- kiracı kaydı (workspace_id NOT NULL); platform düzeyindeki bir yönetici
-- işleminin yazılacağı yer yoktu.
--
-- KARARLAR (kullanıcı, 27 Eylül 2026):
--   - Her işlem GEREKÇE ister (en az 10 karakter) ve admin_actions'a
--     öncesi/sonrası ile yazılır. İşlem ve kayıt tek transaction: kayıt
--     yazılamazsa işlem de olmaz.
--   - admin_actions SALT EKLENİR: UPDATE, DELETE ve TRUNCATE tetikleyiciyle
--     herkese (service_role ve postgres dahil) kapalı. Doğrudan okuma/yazma
--     yok; okuma admin_list_actions ile.
--   - workspace_id YABANCI ANAHTAR DEĞİL, ad da kopyalanır: alan ileride
--     silinirse kayıt kalmalı. FK'nin ON DELETE SET NULL'u bir UPDATE'tir
--     ve değiştirilemezlik tetikleyicisi silmeyi engellerdi.
--   - Öncesi/sonrası yalnız alan düzeyinde değerler taşır (tarih, sayı,
--     durum); kişisel veri yok.
--
-- KAPSAM DIŞI — SİLME YÜRÜTME: 053 otomatik silmeyi bilerek dışarıda
-- bıraktı ("test edilmemiş geri alınamaz işlem"). Silmenin neyi kapsadığı
-- (fatura kayıtları, hesaplar, yedekler) tanımlanmadan panelde düğme
-- olmayacak. Bu migration yalnız GERİ ALINABİLİR işlemleri içerir.
--
-- İŞLEMLER
--   admin_extend_trial         denemeyi 1-30 gün uzatır (bitmişse bugünden)
--   admin_set_workspace_status active <-> suspended (051 erişimi keser/açar)
--   admin_grant_license        ödemesiz lisans: 058 modeliyle aynı birleştirme
--                              (süre üst üste biner, öğrenci sayısı büyüğü)
--   admin_set_student_limit    öğrenci limiti; mevcut öğrenci sayısının altı olmaz
--   admin_resolve_order        1 saatten eski bekleyen sipariş: ödendi
--                              (settle_billing_order — lisans + partner hakedişi)
--                              ya da başarısız (fail_billing_order)
--   admin_list_actions         yönetim kaydını okur
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id  UUID NOT NULL,
  actor_name        TEXT,
  action            TEXT NOT NULL,
  workspace_id      UUID,
  workspace_name    TEXT,
  target_id         UUID,
  reason            TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
  before            JSONB NOT NULL DEFAULT '{}'::JSONB,
  after             JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_workspace ON public.admin_actions (workspace_id, created_at DESC);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
-- Politika yok: yazma yalnız aşağıdaki fonksiyonlardan, okuma admin_list_actions'tan.
REVOKE ALL ON public.admin_actions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.forbid_admin_actions_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  RAISE EXCEPTION 'Yönetim kaydı değiştirilemez ve silinemez.' USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_admin_actions_no_update ON public.admin_actions;
CREATE TRIGGER trg_admin_actions_no_update
  BEFORE UPDATE OR DELETE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.forbid_admin_actions_change();

DROP TRIGGER IF EXISTS trg_admin_actions_no_truncate ON public.admin_actions;
CREATE TRIGGER trg_admin_actions_no_truncate
  BEFORE TRUNCATE ON public.admin_actions
  FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_admin_actions_change();


-- ------------------------------------------------------------
-- İç yardımcılar (istemciye kapalı)
-- ------------------------------------------------------------

-- Gerekçe denetimi: boşluk kırpılmış 10-500 karakter.
CREATE OR REPLACE FUNCTION public.require_admin_reason(p_reason TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Gerekçe en az 10 karakter olmalı.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Gerekçe en fazla 500 karakter olabilir.' USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_reason);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.record_admin_action(
  p_action       TEXT,
  p_workspace_id UUID,
  p_target_id    UUID,
  p_reason       TEXT,
  p_before       JSONB,
  p_after        JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id    UUID;
  v_actor UUID := public.current_profile_id();
BEGIN
  IF NOT public.is_platform_admin() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.admin_actions (
    actor_profile_id, actor_name, action, workspace_id, workspace_name,
    target_id, reason, before, after
  )
  VALUES (
    v_actor,
    (SELECT full_name FROM public.profiles WHERE id = v_actor),
    p_action,
    p_workspace_id,
    (SELECT name FROM public.workspaces WHERE id = p_workspace_id),
    p_target_id,
    public.require_admin_reason(p_reason),
    COALESCE(p_before, '{}'::JSONB),
    COALESCE(p_after, '{}'::JSONB)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.require_admin_reason(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_admin_action(TEXT, UUID, UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 1) Deneme uzatma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_extend_trial(p_workspace_id UUID, p_days INTEGER, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws  public.workspaces%ROWTYPE;
  v_new TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);
  IF p_days IS NULL OR p_days < 1 OR p_days > 30 THEN
    RAISE EXCEPTION 'Uzatma 1 ile 30 gün arasında olmalı.';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_ws.is_library THEN
    RAISE EXCEPTION 'Çalışma alanı bulunamadı.';
  END IF;
  IF v_ws.plan <> 'trial' THEN
    RAISE EXCEPTION 'Yalnız denemedeki bir çalışma alanının süresi uzatılabilir.';
  END IF;

  -- Bitmiş denemede uzatma BUGÜNDEN sayılır: "3 gün uzat" dünü geri vermez.
  v_new := GREATEST(COALESCE(v_ws.trial_ends_at, NOW()), NOW()) + make_interval(days => p_days);

  UPDATE public.workspaces SET trial_ends_at = v_new, updated_at = NOW() WHERE id = p_workspace_id;

  PERFORM public.record_admin_action(
    'workspace.extend_trial', p_workspace_id, NULL, p_reason,
    jsonb_build_object('trial_ends_at', v_ws.trial_ends_at),
    jsonb_build_object('trial_ends_at', v_new, 'days', p_days)
  );
  RETURN jsonb_build_object('trial_ends_at', v_new);
END;
$fn$;


-- ------------------------------------------------------------
-- 2) Askıya alma / yeniden açma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_workspace_status(p_workspace_id UUID, p_status TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws public.workspaces%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);
  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Durum yalnız aktif ya da askıda olabilir.';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_ws.is_library THEN
    RAISE EXCEPTION 'Çalışma alanı bulunamadı.';
  END IF;
  IF v_ws.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Arşivlenmiş bir çalışma alanının durumu buradan değiştirilemez.';
  END IF;
  IF v_ws.status = p_status THEN
    RAISE EXCEPTION 'Çalışma alanı zaten bu durumda.';
  END IF;

  UPDATE public.workspaces SET status = p_status, updated_at = NOW() WHERE id = p_workspace_id;

  PERFORM public.record_admin_action(
    CASE WHEN p_status = 'suspended' THEN 'workspace.suspend' ELSE 'workspace.reactivate' END,
    p_workspace_id, NULL, p_reason,
    jsonb_build_object('status', v_ws.status),
    jsonb_build_object('status', p_status)
  );
  RETURN jsonb_build_object('status', p_status);
END;
$fn$;


-- ------------------------------------------------------------
-- 3) Ödemesiz lisans
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_grant_license(
  p_workspace_id UUID, p_student_count INTEGER, p_months INTEGER, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws      public.workspaces%ROWTYPE;
  v_lic     public.workspace_licenses%ROWTYPE;
  v_new_end TIMESTAMPTZ;
  v_limit   INTEGER;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);
  IF p_student_count IS NULL OR p_student_count < 1 OR p_student_count > 1000 THEN
    RAISE EXCEPTION 'Öğrenci sayısı 1 ile 1000 arasında olmalı.';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'Süre 1 ile 24 ay arasında olmalı.';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_ws.is_library THEN
    RAISE EXCEPTION 'Çalışma alanı bulunamadı.';
  END IF;
  IF v_ws.plan = 'institution' THEN
    RAISE EXCEPTION 'Kurumsal çalışma alanı sınırsız; lisans verilmez.';
  END IF;

  SELECT * INTO v_lic FROM public.workspace_licenses
  WHERE workspace_id = p_workspace_id AND status = 'active' FOR UPDATE;

  -- 059'daki settle_billing_order ile aynı birleştirme: süre üst üste
  -- biner (bitmişse bugünden), öğrenci hakkı büyüğü.
  v_new_end := GREATEST(COALESCE(v_lic.ends_at, NOW()), NOW()) + make_interval(months => p_months);
  v_limit := GREATEST(p_student_count, COALESCE(v_lic.student_count, 0));

  IF v_lic.id IS NULL THEN
    INSERT INTO public.workspace_licenses (
      workspace_id, provider, provider_reference, student_count, status, starts_at, ends_at
    )
    VALUES (p_workspace_id, 'manual', NULL, v_limit, 'active', NOW(), v_new_end);
  ELSE
    UPDATE public.workspace_licenses
    SET student_count = v_limit, ends_at = v_new_end, updated_at = NOW()
    WHERE id = v_lic.id;
  END IF;

  -- Durum (askı) DEĞİŞMEZ: lisans vermek askıyı sessizce kaldırmamalı.
  UPDATE public.workspaces
  SET plan = 'licensed', student_limit = v_limit, trial_ends_at = NULL, updated_at = NOW()
  WHERE id = p_workspace_id;

  PERFORM public.record_admin_action(
    'license.grant', p_workspace_id, NULL, p_reason,
    jsonb_build_object('plan', v_ws.plan, 'student_limit', v_ws.student_limit,
                       'trial_ends_at', v_ws.trial_ends_at, 'license_ends_at', v_lic.ends_at),
    jsonb_build_object('plan', 'licensed', 'student_limit', v_limit,
                       'license_ends_at', v_new_end, 'months', p_months)
  );
  RETURN jsonb_build_object('student_limit', v_limit, 'ends_at', v_new_end);
END;
$fn$;


-- ------------------------------------------------------------
-- 4) Öğrenci limiti
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_student_limit(p_workspace_id UUID, p_limit INTEGER, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws     public.workspaces%ROWTYPE;
  v_active INTEGER;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Öğrenci limiti 1 ile 10000 arasında olmalı.';
  END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF NOT FOUND OR v_ws.is_library THEN
    RAISE EXCEPTION 'Çalışma alanı bulunamadı.';
  END IF;
  IF v_ws.plan = 'institution' THEN
    RAISE EXCEPTION 'Kurumsal çalışma alanında öğrenci limiti yok.';
  END IF;

  SELECT COUNT(*) INTO v_active FROM public.students
  WHERE workspace_id = p_workspace_id AND status = 'active';
  IF p_limit < v_active THEN
    RAISE EXCEPTION 'Limit, mevcut % aktif öğrencinin altına düşürülemez.', v_active;
  END IF;

  UPDATE public.workspaces SET student_limit = p_limit, updated_at = NOW() WHERE id = p_workspace_id;
  -- Aktif lisans varsa hakkı da aynı sayı: sonraki ödeme GREATEST ile
  -- birleştiriyor (059), limit orada sessizce geri dönmesin.
  UPDATE public.workspace_licenses SET student_count = p_limit, updated_at = NOW()
  WHERE workspace_id = p_workspace_id AND status = 'active';

  PERFORM public.record_admin_action(
    'workspace.student_limit', p_workspace_id, NULL, p_reason,
    jsonb_build_object('student_limit', v_ws.student_limit, 'active_students', v_active),
    jsonb_build_object('student_limit', p_limit)
  );
  RETURN jsonb_build_object('student_limit', p_limit);
END;
$fn$;


-- ------------------------------------------------------------
-- 5) Bekleyen siparişi kapatma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_order(p_order_id UUID, p_outcome TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order  public.billing_orders%ROWTYPE;
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);
  IF p_outcome NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'Sonuç yalnız ödendi ya da başarısız olabilir.';
  END IF;

  SELECT * INTO v_order FROM public.billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sipariş bulunamadı.';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Yalnız bekleyen bir sipariş kapatılabilir.';
  END IF;
  -- Süren bir ödemeyle yarışmasın: ödeme sayfası açık olabilir.
  IF v_order.created_at > NOW() - INTERVAL '1 hour' THEN
    RAISE EXCEPTION 'Sipariş bir saatten yeni; ödeme hâlâ sürüyor olabilir.';
  END IF;

  IF p_outcome = 'paid' THEN
    -- Ödeme sağlayıcısında doğrulanmış tahsilat için: lisans ve partner
    -- hakedişi olağan yoldan (059) oluşur.
    v_result := public.settle_billing_order(p_order_id, 'manual:' || public.current_profile_id()::TEXT, NULL);
  ELSE
    PERFORM public.fail_billing_order(p_order_id, 'Yönetici kapattı: ' || btrim(p_reason));
    v_result := jsonb_build_object('order_id', p_order_id, 'status', 'failed');
  END IF;

  PERFORM public.record_admin_action(
    CASE WHEN p_outcome = 'paid' THEN 'order.mark_paid' ELSE 'order.mark_failed' END,
    v_order.workspace_id, p_order_id, p_reason,
    jsonb_build_object('status', v_order.status, 'gross_kurus', v_order.gross_kurus,
                       'student_count', v_order.student_count, 'months', v_order.months),
    jsonb_build_object('status', p_outcome)
  );
  RETURN v_result;
END;
$fn$;


-- ------------------------------------------------------------
-- 6) Yönetim kaydını okuma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_actions(
  p_limit        INTEGER DEFAULT 100,
  p_offset       INTEGER DEFAULT 0,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, actor_name TEXT, action TEXT,
  workspace_id UUID, workspace_name TEXT, target_id UUID, reason TEXT,
  before JSONB, after JSONB, total BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT x.id, x.created_at, x.actor_name, x.action, x.workspace_id,
         COALESCE(w.name, x.workspace_name), x.target_id, x.reason, x.before, x.after,
         COUNT(*) OVER ()
  FROM public.admin_actions x
  LEFT JOIN public.workspaces w ON w.id = x.workspace_id
  WHERE p_workspace_id IS NULL OR x.workspace_id = p_workspace_id
  ORDER BY x.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;


-- ------------------------------------------------------------
-- Yetkiler ve doğrulama
-- ------------------------------------------------------------
DO $yetki$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_extend_trial(uuid,integer,text)',
    'admin_set_workspace_status(uuid,text,text)',
    'admin_grant_license(uuid,integer,integer,text)',
    'admin_set_student_limit(uuid,integer,text)',
    'admin_resolve_order(uuid,text,text)',
    'admin_list_actions(integer,integer,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_fn);
    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '128 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%is_platform_admin()%' THEN
      RAISE EXCEPTION '128 DOĞRULAMA: % yönetici denetimi yapmıyor.', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.record_admin_action(text,uuid,uuid,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '128 DOĞRULAMA: record_admin_action istemciye açık.';
  END IF;
  IF has_table_privilege('authenticated', 'public.admin_actions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_actions', 'INSERT')
     OR has_table_privilege('anon', 'public.admin_actions', 'SELECT') THEN
    RAISE EXCEPTION '128 DOĞRULAMA: admin_actions doğrudan erişilebilir.';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger
      WHERE tgrelid = 'public.admin_actions'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION '128 DOĞRULAMA: değiştirilemezlik tetikleyicileri eksik.';
  END IF;
  RAISE NOTICE '128: beş yönetim işlemi ve salt eklenen yönetim kaydı hazır.';
END;
$yetki$;

-- ROLLBACK (kayıt SİLİNMEZ; tetikleyiciler önce kaldırılmalı — bilinçli zorluk):
--   DROP FUNCTION public.admin_list_actions(integer,integer,uuid);
--   DROP FUNCTION public.admin_resolve_order(uuid,text,text);
--   DROP FUNCTION public.admin_set_student_limit(uuid,integer,text);
--   DROP FUNCTION public.admin_grant_license(uuid,integer,integer,text);
--   DROP FUNCTION public.admin_set_workspace_status(uuid,text,text);
--   DROP FUNCTION public.admin_extend_trial(uuid,integer,text);
--   DROP FUNCTION public.record_admin_action(text,uuid,uuid,text,jsonb,jsonb);
--   DROP FUNCTION public.require_admin_reason(text);
