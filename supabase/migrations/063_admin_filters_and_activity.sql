-- ============================================================
-- 063 — YÖNETİM PANELİ: FİLTRELER VE SON AKTİVİTELER
--
-- 062 paneli "ne oluyor" diyebilir hâle getirdi. Bu migration iki
-- eksiği kapatıyor:
--
--   1. FİLTRELER SQL TARAFINDA. Sayfa 200 kayıt çekiyor; filtreyi
--      TypeScript'te uygulamak, 200'den fazla çalışma alanı olduğu gün
--      sessizce yanlış sonuç verirdi — kullanıcı "askıdakiler" derken
--      yalnız ilk 200'ün içindeki askıdakileri görürdü. Filtre, LIMIT'in
--      ÖNÜNDE çalışmalı.
--
--   2. SON AKTİVİTELER akışı. audit_events zaten yazılıyor ama hiçbir
--      yönetim ekranı okumuyordu.
--
-- ÖĞRENCİ VERİSİ YOK: akış yalnız çalışma alanı adını, eylem türünü ve
-- zamanı döndürüyor. `audit_events.detail` bu ürüne göre kişisel veri
-- taşımıyor (051'deki sözleşme) ama yine de HİÇ döndürülmüyor — bir gün
-- oraya bir ad yazılırsa bu ekran onu sızdırmasın.
-- ============================================================

-- ------------------------------------------------------------
-- 1) admin_list_workspaces — filtre parametreleri
--
-- İKİ İMZA DA DÜŞÜRÜLÜYOR: 062'deki iki parametreli sürüm ve bu
-- dosyanın kendi beş parametreli sürümü. Varsayılan değerli parametre
-- eklemek eski imzayı silmez; ikisi birden dururken iki argümanlı çağrı
-- "function is not unique" hatası verir.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT);

CREATE FUNCTION public.admin_list_workspaces(
  p_search  TEXT DEFAULT NULL,
  p_limit   INTEGER DEFAULT 100,
  -- 'active' | 'suspended' | 'archived'
  p_status  TEXT DEFAULT NULL,
  -- 'trial' | 'licensed' | 'institution'
  p_plan    TEXT DEFAULT NULL,
  -- 'with' (partneri olan) | 'without' (olmayan)
  p_partner TEXT DEFAULT NULL
)
RETURNS TABLE (
  workspace_id     UUID,
  workspace_name   TEXT,
  owner_name       TEXT,
  owner_email      TEXT,
  created_at       TIMESTAMPTZ,
  plan             TEXT,
  status           TEXT,
  active_students  INTEGER,
  student_limit    INTEGER,
  trial_ends_at    TIMESTAMPTZ,
  license_ends_at  TIMESTAMPTZ,
  total_paid_kurus BIGINT,
  partner_code     TEXT,
  license_student_count INTEGER,
  license_months        INTEGER,
  last_activity_at      TIMESTAMPTZ,
  pending_order_kurus   BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    p.full_name,
    p.email,
    w.created_at,
    w.plan,
    w.status,
    (SELECT COUNT(*)::INTEGER FROM public.students s
      WHERE s.workspace_id = w.id AND s.status = 'active'),
    w.student_limit,
    w.trial_ends_at,
    l.ends_at,
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'paid'), 0)::BIGINT,
    pt.code,
    l.student_count,
    -- SÜRE, TEK SİPARİŞTEN DEĞİL LİSANSIN KENDİSİNDEN hesaplanıyor.
    -- settle_billing_order alımları üst üste bindiriyor (058); son
    -- siparişin "months" değeri toplam süreyi göstermez.
    (CASE WHEN l.starts_at IS NULL THEN NULL ELSE
      (EXTRACT(YEAR FROM age(l.ends_at, l.starts_at)) * 12
       + EXTRACT(MONTH FROM age(l.ends_at, l.starts_at)))::INTEGER
    END),
    (SELECT MAX(a.created_at) FROM public.audit_events a
      WHERE a.workspace_id = w.id),
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'pending'), 0)::BIGINT
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_profile_id
  LEFT JOIN public.partners pt ON pt.id = w.referred_by_partner_id
  LEFT JOIN public.workspace_licenses l
    ON l.workspace_id = w.id AND l.status = 'active'
  WHERE (
      p_search IS NULL
      OR w.name ILIKE '%' || p_search || '%'
      OR p.full_name ILIKE '%' || p_search || '%'
      OR p.email ILIKE '%' || p_search || '%'
    )
    AND (p_status IS NULL OR w.status = p_status)
    AND (p_plan IS NULL OR w.plan = p_plan)
    AND (
      p_partner IS NULL
      OR (p_partner = 'with' AND w.referred_by_partner_id IS NOT NULL)
      OR (p_partner = 'without' AND w.referred_by_partner_id IS NULL)
    )
  ORDER BY w.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
END;
$fn$;

GRANT EXECUTE ON FUNCTION
  public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) admin_recent_activity — platform genelinde son hareketler
--
-- audit_events kiracıya göre yalıtılmış (051 RLS); bu fonksiyon
-- SECURITY DEFINER olarak o sınırın üstünden geçen TEK yer ve yalnız
-- platform yöneticisine açık.
--
-- workspace.switch DIŞARIDA: gezinme olayı, iş olayı değil. Akışa
-- girseydi gerçek hareketleri boğardı — bir kullanıcı gün içinde
-- onlarca kez çalışma alanı değiştirebiliyor.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_recent_activity(INTEGER);

CREATE FUNCTION public.admin_recent_activity(p_limit INTEGER DEFAULT 30)
RETURNS TABLE (
  id             UUID,
  workspace_id   UUID,
  workspace_name TEXT,
  action         TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT a.id, a.workspace_id, w.name, a.action, a.created_at
  FROM public.audit_events a
  JOIN public.workspaces w ON w.id = a.workspace_id
  WHERE a.action <> 'workspace.switch'
  ORDER BY a.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 30), 200);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_recent_activity(INTEGER) TO authenticated;

-- Akış her açılışta audit_events'in sonunu okuyor; created_at üzerinde
-- azalan bir indeks olmadan tablo büyüdükçe sıralama pahalılaşır.
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON public.audit_events (created_at DESC);

-- ------------------------------------------------------------
-- 3) admin_overview — filtreden ETKİLENMEYEN sayılar
--
-- Panelde artık filtre var. Bekleyen ödeme toplamı ve "dikkat
-- gerektirenler" sayıları önceden tablo satırlarından hesaplanıyordu;
-- filtre uygulanınca bunlar da filtreye göre değişirdi. Oysa bu
-- rakamların soruları global: "sistemde kaç deneme bitmek üzere",
-- "toplam ne kadar ödeme bekliyor". Filtre listenin sorusudur, özetin
-- değil.
--
-- Dönüş tipi değiştiği için CREATE OR REPLACE yetmez.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_overview();

CREATE FUNCTION public.admin_overview()
RETURNS TABLE (
  total_workspaces    INTEGER,
  trial_workspaces    INTEGER,
  licensed_workspaces INTEGER,
  total_students      INTEGER,
  open_tickets        INTEGER,
  revenue_kurus       BIGINT,
  -- 063 ile eklenenler:
  pending_kurus       BIGINT,
  expiring_trials     INTEGER,
  awaiting_payment    INTEGER,
  at_student_limit    INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM public.workspaces),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces WHERE plan = 'trial'),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces WHERE plan = 'licensed'),
    (SELECT COUNT(*)::INTEGER FROM public.students WHERE status = 'active'),
    (SELECT COUNT(*)::INTEGER FROM public.support_tickets WHERE status <> 'closed'),
    COALESCE((SELECT SUM(gross_kurus) FROM public.billing_orders WHERE status = 'paid'), 0)::BIGINT,
    COALESCE((SELECT SUM(gross_kurus) FROM public.billing_orders WHERE status = 'pending'), 0)::BIGINT,
    -- Bitmesine 3 gün ya da daha az kalan denemeler. Süresi ÇOKTAN
    -- dolmuşlar sayılmıyor: onlar için yapılacak bir şey kalmadı,
    -- "dikkat gerektiren" bir iş değiller.
    (SELECT COUNT(*)::INTEGER FROM public.workspaces
      WHERE plan = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '3 days'),
    (SELECT COUNT(DISTINCT workspace_id)::INTEGER FROM public.billing_orders
      WHERE status = 'pending'),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces w
      WHERE w.student_limit IS NOT NULL
        AND (SELECT COUNT(*) FROM public.students s
              WHERE s.workspace_id = w.id AND s.status = 'active') >= w.student_limit);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

-- ============================================================
-- GERİ ALMA (elle):
--   DROP FUNCTION IF EXISTS public.admin_overview();
--   -- admin_overview 060'daki altı sütunlu hâline döndürülmeli.
--   DROP FUNCTION IF EXISTS public.admin_recent_activity(INTEGER);
--   DROP INDEX IF EXISTS public.idx_audit_events_created_at;
--   DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT);
--   -- admin_list_workspaces 062'deki iki parametreli hâline döndürülmeli.
-- ============================================================
