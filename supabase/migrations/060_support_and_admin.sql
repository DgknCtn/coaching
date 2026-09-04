-- ============================================================
-- 060_support_and_admin
--
-- DESTEK MERKEZİ + PLATFORM YÖNETİCİSİ.
--
-- ============================================================
-- EN KRİTİK KARAR: ADMİN HER ŞEYİ GÖRMEZ
--
-- Bu ürün reşit olmayan öğrencilerin akademik verisini işliyor. "Yönetici
-- her şeyi görür" varsayılanı burada savunulabilir değil.
--
-- Bu yüzden admin ekranları BLANKET RLS BYPASS ile beslenmiyor. Her
-- görünüm, yalnız ihtiyacı olan alanları döndüren ayrı bir SECURITY
-- DEFINER fonksiyonla besleniyor ve her biri girişinde
-- is_platform_admin() kontrol ediyor.
--
-- Admin ŞUNLARI görür: çalışma alanı adı, sahibi, kayıt tarihi, aktif
-- öğrenci SAYISI, lisans durumu, toplam ödeme.
-- Admin ŞUNLARI GÖRMEZ: öğrenci adı, ödevi, ilerlemesi, notları.
--
-- 049'daki P0 sızıntısının dersi bu: geniş bir okuma yolu açmak, o
-- yolun bir gün yanlış elde olacağı anlamına gelir.
-- ============================================================


-- ============================================================
-- 1) PLATFORM YÖNETİCİSİ
--
-- Ayrı bir tablo değil, profiles üzerinde bir bayrak: admin sayısı
-- daima çok az olacak ve ayrı bir tablo her sorguya bir JOIN eklerdi.
--
-- VARSAYILAN FALSE ve hiçbir arayüzden değiştirilemez — yalnız
-- veritabanına doğrudan erişimi olan biri admin atayabilir. Kendi
-- kendini admin yapabilen bir uç, tanımı gereği bir güvenlik açığıdır.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'Platform yöneticisi. Yalnız veritabanından elle atanır; hiçbir arayüzden değiştirilemez.';

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE auth_user_id = auth.uid()),
    FALSE
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;


-- ============================================================
-- 2) DESTEK TALEPLERİ
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  opened_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  subject   TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 200),
  category  TEXT NOT NULL DEFAULT 'genel'
            CHECK (category IN ('genel', 'teknik', 'odeme', 'oneri')),

  -- 'answered' = destek yanıtladı, kullanıcı henüz dönmedi.
  -- Kullanıcının bekleyip beklemediğini ayırt etmek, talep listesini
  -- önceliklendirmenin tek yolu.
  status    TEXT NOT NULL DEFAULT 'open'
            CHECK (status IN ('open', 'answered', 'closed')),

  priority  TEXT NOT NULL DEFAULT 'normal'
            CHECK (priority IN ('low', 'normal', 'high')),

  -- Sıralama için: son hareket eden talep üstte olmalı.
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_workspace
  ON public.support_tickets (workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_open
  ON public.support_tickets (status, last_message_at DESC)
  WHERE status <> 'closed';

DROP TRIGGER IF EXISTS handle_updated_at ON public.support_tickets;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


CREATE TABLE IF NOT EXISTS public.support_messages (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Yazarın adı KOPYALANIYOR: profil silinse bile yazışma okunabilir
  -- kalmalı. audit_events'teki aynı gerekçe.
  author_name TEXT,

  body      TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  /** Destek ekibinden mi geldi? Arayüz balonu buna göre hizalar. */
  is_staff  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON public.support_messages (ticket_id, created_at);


-- ------------------------------------------------------------
-- RLS
--
-- Kullanıcı yalnız KENDİ çalışma alanının taleplerini görür. Admin
-- politikadan DEĞİL, aşağıdaki RPC'lerden okur — admin için ayrı bir
-- politika açmak, o politikanın bir gün başka bir sorguda da geçerli
-- olması demekti.
-- ------------------------------------------------------------
ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  FOR SELECT USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND public.has_workspace_role(t.workspace_id, ARRAY['owner', 'teacher'])
    )
  );

REVOKE ALL ON public.support_tickets  FROM anon;
REVOKE ALL ON public.support_messages FROM anon;
GRANT SELECT ON public.support_tickets  TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;


-- ------------------------------------------------------------
-- open_support_ticket
--
-- Talep ve ilk mesaj TEK İŞLEMDE: ikisi ayrı çağrı olsaydı, mesaj
-- yazılamadığında gövdesi boş bir talep kalırdı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_support_ticket(
  p_workspace_id UUID,
  p_subject      TEXT,
  p_body         TEXT,
  p_category     TEXT DEFAULT 'genel'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
  v_ticket_id  UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_name
  FROM public.profiles WHERE id = public.current_profile_id();

  INSERT INTO public.support_tickets (
    workspace_id, opened_by_profile_id, subject, category
  )
  VALUES (
    p_workspace_id, v_profile_id, TRIM(p_subject), COALESCE(p_category, 'genel')
  )
  RETURNING id INTO v_ticket_id;

  INSERT INTO public.support_messages (ticket_id, author_profile_id, author_name, body)
  VALUES (v_ticket_id, v_profile_id, v_name, TRIM(p_body));

  RETURN jsonb_build_object('ticket_id', v_ticket_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.open_support_ticket(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- reply_support_ticket
--
-- Hem kullanıcı hem admin aynı fonksiyonu kullanır; `is_staff`
-- ÇAĞIRANDAN DEĞİL, sunucudan türetilir. İstemciye bırakılsaydı bir
-- kullanıcı kendi mesajını "destek ekibinden" gibi gösterebilirdi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reply_support_ticket(
  p_ticket_id UUID,
  p_body      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_profile_id   UUID;
  v_name         TEXT;
  v_is_admin     BOOLEAN;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.support_tickets WHERE id = p_ticket_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Destek talebi bulunamadı';
  END IF;

  v_is_admin := public.is_platform_admin();

  IF NOT v_is_admin
     AND NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id, full_name INTO v_profile_id, v_name
  FROM public.profiles WHERE id = public.current_profile_id();

  INSERT INTO public.support_messages (
    ticket_id, author_profile_id, author_name, body, is_staff
  )
  VALUES (
    p_ticket_id, v_profile_id,
    CASE WHEN v_is_admin THEN 'Destek Ekibi' ELSE v_name END,
    TRIM(p_body), v_is_admin
  );

  -- Durum otomatik: destek yanıtladıysa 'answered', kullanıcı
  -- yazdıysa 'open'. Elle durum yönetmek, kimsenin güncellemediği
  -- ve bu yüzden yalan söyleyen bir alan üretir.
  UPDATE public.support_tickets
  SET status = CASE WHEN v_is_admin THEN 'answered' ELSE 'open' END,
      last_message_at = NOW(),
      updated_at = NOW()
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object('ticket_id', p_ticket_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reply_support_ticket(UUID, TEXT) TO authenticated;


CREATE OR REPLACE FUNCTION public.close_support_ticket(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.support_tickets WHERE id = p_ticket_id;

  IF v_workspace_id IS NULL THEN RETURN; END IF;

  IF NOT public.is_platform_admin()
     AND NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.support_tickets
  SET status = 'closed', updated_at = NOW()
  WHERE id = p_ticket_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.close_support_ticket(UUID) TO authenticated;


-- ============================================================
-- 3) ADMİN GÖRÜNÜMLERİ — her biri dar ve ayrı
-- ============================================================

-- ------------------------------------------------------------
-- admin_list_workspaces
--
-- ÖĞRENCİ VERİSİ YOK: yalnız SAYI. Koçun kaç öğrencisi olduğu bir
-- faturalama bilgisidir; öğrencinin kim olduğu değil.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_workspaces(
  p_search TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100
)
RETURNS TABLE (
  workspace_id    UUID,
  workspace_name  TEXT,
  owner_name      TEXT,
  owner_email     TEXT,
  created_at      TIMESTAMPTZ,
  plan            TEXT,
  status          TEXT,
  active_students INTEGER,
  student_limit   INTEGER,
  trial_ends_at   TIMESTAMPTZ,
  license_ends_at TIMESTAMPTZ,
  total_paid_kurus BIGINT,
  partner_code    TEXT
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
    (SELECT l.ends_at FROM public.workspace_licenses l
      WHERE l.workspace_id = w.id AND l.status = 'active'),
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'paid'), 0)::BIGINT,
    pt.code
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_profile_id
  LEFT JOIN public.partners pt ON pt.id = w.referred_by_partner_id
  WHERE p_search IS NULL
     OR w.name ILIKE '%' || p_search || '%'
     OR p.full_name ILIKE '%' || p_search || '%'
     OR p.email ILIKE '%' || p_search || '%'
  ORDER BY w.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_workspaces(TEXT, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- admin_list_tickets
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_tickets(
  p_status TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100
)
RETURNS TABLE (
  ticket_id      UUID,
  workspace_name TEXT,
  opened_by      TEXT,
  subject        TEXT,
  category       TEXT,
  status         TEXT,
  priority       TEXT,
  message_count  INTEGER,
  last_message_at TIMESTAMPTZ,
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
  SELECT
    t.id, w.name, p.full_name, t.subject, t.category, t.status, t.priority,
    (SELECT COUNT(*)::INTEGER FROM public.support_messages m WHERE m.ticket_id = t.id),
    t.last_message_at,
    t.created_at
  FROM public.support_tickets t
  JOIN public.workspaces w ON w.id = t.workspace_id
  LEFT JOIN public.profiles p ON p.id = t.opened_by_profile_id
  WHERE p_status IS NULL OR t.status = p_status
  ORDER BY
    -- Açık talepler üstte, sonra en son hareket eden.
    CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
    t.last_message_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_tickets(TEXT, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- admin_ticket_messages — tek talebin yazışması
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ticket_messages(p_ticket_id UUID)
RETURNS TABLE (
  author_name TEXT,
  body        TEXT,
  is_staff    BOOLEAN,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT m.author_name, m.body, m.is_staff, m.created_at
  FROM public.support_messages m
  WHERE m.ticket_id = p_ticket_id
  ORDER BY m.created_at;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_ticket_messages(UUID) TO authenticated;


-- ------------------------------------------------------------
-- admin_list_partners
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_partners()
RETURNS TABLE (
  partner_id      UUID,
  code            TEXT,
  name            TEXT,
  email           TEXT,
  commission_rate NUMERIC,
  status          TEXT,
  referral_count  INTEGER,
  paying_count    INTEGER,
  total_kurus     BIGINT,
  unpaid_kurus    BIGINT
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
    pt.id, pt.code, pt.name, pt.email, pt.commission_rate, pt.status,
    (SELECT COUNT(*)::INTEGER FROM public.workspaces w
      WHERE w.referred_by_partner_id = pt.id),
    (SELECT COUNT(DISTINCT c.workspace_id)::INTEGER FROM public.partner_commissions c
      WHERE c.partner_id = pt.id),
    COALESCE((SELECT SUM(c.commission_kurus) FROM public.partner_commissions c
      WHERE c.partner_id = pt.id AND c.status <> 'cancelled'), 0)::BIGINT,
    COALESCE((SELECT SUM(c.commission_kurus) FROM public.partner_commissions c
      WHERE c.partner_id = pt.id AND c.status IN ('pending', 'approved')), 0)::BIGINT
  FROM public.partners pt
  ORDER BY pt.created_at DESC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_partners() TO authenticated;


-- ------------------------------------------------------------
-- admin_mark_commissions_paid — hakedişi ödendi işaretler
--
-- Para transferi ELLE yapılıyor; bu yalnız kaydı günceller. Otomatik
-- ödeme yazmak, test edilmemiş bir para gönderme aracını üretime
-- koymak olurdu.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mark_commissions_paid(p_partner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.partner_commissions
  SET status = 'paid', paid_at = NOW(), updated_at = NOW()
  WHERE partner_id = p_partner_id AND status IN ('pending', 'approved');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('marked', v_count);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_mark_commissions_paid(UUID) TO authenticated;


-- ------------------------------------------------------------
-- admin_overview — panel özeti
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
  total_workspaces  INTEGER,
  trial_workspaces  INTEGER,
  licensed_workspaces INTEGER,
  total_students    INTEGER,
  open_tickets      INTEGER,
  revenue_kurus     BIGINT
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
    COALESCE((SELECT SUM(gross_kurus) FROM public.billing_orders WHERE status = 'paid'), 0)::BIGINT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;


-- ============================================================
-- ADMİN ATAMA — elle, veritabanından:
--   UPDATE public.profiles SET is_platform_admin = TRUE
--   WHERE email = 'sizin@epostaniz';
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.admin_overview();
--   DROP FUNCTION IF EXISTS public.admin_mark_commissions_paid(UUID);
--   DROP FUNCTION IF EXISTS public.admin_list_partners();
--   DROP FUNCTION IF EXISTS public.admin_ticket_messages(UUID);
--   DROP FUNCTION IF EXISTS public.admin_list_tickets(TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS public.close_support_ticket(UUID);
--   DROP FUNCTION IF EXISTS public.reply_support_ticket(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.open_support_ticket(UUID, TEXT, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.support_messages;
--   DROP TABLE IF EXISTS public.support_tickets;
--   DROP FUNCTION IF EXISTS public.is_platform_admin();
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_platform_admin;
-- ============================================================
