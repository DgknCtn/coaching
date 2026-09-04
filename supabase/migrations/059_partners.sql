-- ============================================================
-- 059_partners
--
-- PARTNER (İŞ ORTAĞI) SİSTEMİ.
--
-- Partner kendi koduyla müşteri getirir; getirdiği müşterinin HER lisans
-- alımından komisyon kazanır (kullanıcı kararı: süresiz, tüm ödemeler).
--
-- ============================================================
-- KOMİSYON KDV HARİÇ MATRAH ÜZERİNDEN
--
-- Yayınlanan fiyatlar KDV dahil. KDV devlete gidiyor ve bizim gelirimiz
-- değil; komisyon matrahına girmesi, olmayan bir gelirin %10'unu
-- ödemek olurdu. Matrah lib/billing/pricing.ts'teki splitVat ile aynı
-- formülle ayrılıyor.
--
-- HAKEDİŞ ÖDEME KESİNLEŞTİKTEN SONRA ÜRETİLİR
--
-- settle_billing_order içinde, sipariş 'paid' olduktan sonra. Sipariş
-- açılırken üretilseydi, tamamlanmayan her denemede sahte hakediş
-- birikirdi.
-- ============================================================


-- ------------------------------------------------------------
-- 1) partners
--
-- profile_id BAŞTA NULL OLABİLİR: partner kodu, o kişi henüz kaydolmadan
-- da oluşturulabilmeli (anlaşma önce yapılır, hesap sonra açılır).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Paylaşılabilir kod. Okunabilir olmalı: telefonda söylenebilmeli,
  -- yazıya geçirilirken karışmamalı.
  code        TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{4,20}$'),

  name        TEXT NOT NULL,
  email       TEXT,
  -- Partner kaydolduğunda kendi panelini görebilmesi için bağlanır.
  profile_id  UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Oran partner BAŞINA: özel anlaşmalar tek satırlık bir UPDATE ile
  -- yapılabilsin, dağıtım gerektirmesin.
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10
                  CHECK (commission_rate >= 0 AND commission_rate <= 1),

  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'suspended')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.partners;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ------------------------------------------------------------
-- 2) Atıf: hangi çalışma alanını hangi partner getirdi
--
-- Çalışma alanı KURULURKEN yazılır ve BİR DAHA DEĞİŞMEZ. Sonradan
-- değiştirilebilseydi, bir partnerin getirdiği müşteri başka bir
-- partnere aktarılabilirdi.
-- ------------------------------------------------------------
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS referred_by_partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workspaces_referrer
  ON public.workspaces (referred_by_partner_id)
  WHERE referred_by_partner_id IS NOT NULL;


-- ------------------------------------------------------------
-- 3) partner_commissions — sipariş başına bir satır
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Aynı sipariş için ikinci bir hakediş üretilemez. settle_billing_order
  -- idempotent ama tekrarlanan callback'e karşı ikinci bir güvence.
  billing_order_id UUID NOT NULL UNIQUE
                   REFERENCES public.billing_orders(id) ON DELETE CASCADE,

  -- KDV HARİÇ matrah (kuruş). Komisyonun hesaplandığı taban.
  base_kurus       BIGINT NOT NULL CHECK (base_kurus >= 0),
  commission_rate  NUMERIC(5,4) NOT NULL,
  commission_kurus BIGINT NOT NULL CHECK (commission_kurus >= 0),

  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner
  ON public.partner_commissions (partner_id, created_at DESC);

DROP TRIGGER IF EXISTS handle_updated_at ON public.partner_commissions;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.partner_commissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ------------------------------------------------------------
-- 4) RLS
--
-- Partner YALNIZ KENDİ satırlarını görür. Getirdiği çalışma alanının
-- ADINI ve tarihini görür — öğrenci verisine, ödeme tutarına ya da
-- kullanıcı e-postasına erişmez. Partner bir satış ortağıdır, kiracının
-- verisine ortak değil.
-- ------------------------------------------------------------
ALTER TABLE public.partners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT id FROM public.partners
  WHERE profile_id = public.current_profile_id() AND status = 'active';
$fn$;

DROP POLICY IF EXISTS partners_select_self ON public.partners;
CREATE POLICY partners_select_self ON public.partners
  FOR SELECT USING (profile_id = (SELECT public.current_profile_id()));

DROP POLICY IF EXISTS partner_commissions_select_self ON public.partner_commissions;
CREATE POLICY partner_commissions_select_self ON public.partner_commissions
  FOR SELECT USING (partner_id = (SELECT public.current_partner_id()));

REVOKE ALL ON public.partners            FROM anon;
REVOKE ALL ON public.partner_commissions FROM anon;
GRANT SELECT ON public.partners            TO authenticated;
GRANT SELECT ON public.partner_commissions TO authenticated;


-- ------------------------------------------------------------
-- 5) resolve_partner_code — kayıt sırasında kodu doğrular
--
-- Yalnız kodun GEÇERLİ OLUP OLMADIĞINI söyler; partner adını ya da
-- oranını sızdırmaz. Kod deneyerek partner listesi çıkarılamasın diye
-- SECURITY DEFINER ve dar bir dönüş.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_partner_code(p_code TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT id FROM public.partners
  WHERE code = UPPER(TRIM(p_code)) AND status = 'active';
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_partner_code(TEXT) TO anon, authenticated;


-- ------------------------------------------------------------
-- 6) create_teacher_workspace — atıf parametresi
--
-- Kod ÇEREZDEN gelir ve çalışma alanı kurulurken yazılır. OAuth
-- yönlendirmesinden sağ çıkabilmesi için çerez kullanılıyor; sorgu
-- parametresi Google'a gidip dönerken kaybolurdu.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_teacher_workspace(
  p_auth_user_id  UUID,
  p_full_name     TEXT,
  p_email         TEXT,
  p_workspace_name TEXT DEFAULT NULL,
  p_partner_code  TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id    UUID;
  v_workspace_id  UUID;
  v_ws_name       TEXT;
  v_partner_id    UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_auth_user_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.profiles (auth_user_id, full_name, email)
  VALUES (p_auth_user_id, p_full_name, p_email)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = EXCLUDED.email,
        updated_at = NOW()
  RETURNING id INTO v_profile_id;

  v_ws_name := COALESCE(NULLIF(p_workspace_name, ''), p_full_name || ' Workspace');

  -- Geçersiz kod SESSİZCE YOK SAYILIR: kullanıcı yanlış bir bağlantıdan
  -- geldi diye kaydı reddetmek, bize müşteri kaybettirir.
  IF p_partner_code IS NOT NULL THEN
    v_partner_id := public.resolve_partner_code(p_partner_code);
  END IF;

  INSERT INTO public.workspaces (
    name, type, owner_profile_id, plan, trial_ends_at,
    referred_by_partner_id, referred_at
  )
  VALUES (
    v_ws_name, 'individual', v_profile_id, 'trial', NOW() + INTERVAL '7 days',
    v_partner_id,
    CASE WHEN v_partner_id IS NOT NULL THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'owner', 'active');

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'teacher', 'active');

  UPDATE public.profiles
  SET default_workspace_id = v_workspace_id
  WHERE id = v_profile_id;

  RETURN jsonb_build_object('profile_id', v_profile_id, 'workspace_id', v_workspace_id);
END;
$fn$;

-- Eski 4 parametreli imza düşürülüyor: aşırı yükleme olarak kalırsa
-- PostgREST hangisini çağıracağını bilemez.
DROP FUNCTION IF EXISTS public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT);

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 7) settle_billing_order — hakediş üretimi eklendi
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_billing_order(
  p_order_id            UUID,
  p_provider_payment_id TEXT,
  p_provider_reference  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order      public.billing_orders%ROWTYPE;
  v_current    TIMESTAMPTZ;
  v_new_end    TIMESTAMPTZ;
  v_limit      INTEGER;
  v_partner_id UUID;
  v_rate       NUMERIC(5,4);
  v_net        BIGINT;
BEGIN
  SELECT * INTO v_order FROM public.billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'already_settled', true);
  END IF;

  UPDATE public.billing_orders
  SET status = 'paid',
      provider_payment_id = p_provider_payment_id,
      paid_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  SELECT ends_at INTO v_current
  FROM public.workspace_licenses
  WHERE workspace_id = v_order.workspace_id AND status = 'active';

  v_new_end := GREATEST(COALESCE(v_current, NOW()), NOW())
               + (v_order.months || ' months')::INTERVAL;

  SELECT GREATEST(v_order.student_count, COALESCE(student_count, 0))
  INTO v_limit
  FROM public.workspace_licenses
  WHERE workspace_id = v_order.workspace_id AND status = 'active';

  v_limit := COALESCE(v_limit, v_order.student_count);

  IF v_current IS NULL THEN
    INSERT INTO public.workspace_licenses (
      workspace_id, provider, provider_reference,
      student_count, status, starts_at, ends_at
    )
    VALUES (
      v_order.workspace_id, v_order.provider, p_provider_reference,
      v_limit, 'active', NOW(), v_new_end
    );
  ELSE
    UPDATE public.workspace_licenses
    SET student_count = v_limit,
        status = 'active',
        ends_at = v_new_end,
        provider_reference = COALESCE(p_provider_reference, provider_reference),
        updated_at = NOW()
    WHERE workspace_id = v_order.workspace_id AND status = 'active';
  END IF;

  UPDATE public.workspaces
  SET plan = 'licensed',
      student_limit = v_limit,
      trial_ends_at = NULL,
      status = 'active',
      updated_at = NOW()
  WHERE id = v_order.workspace_id;

  -- ---- PARTNER HAKEDİŞİ ----
  SELECT w.referred_by_partner_id, p.commission_rate
  INTO v_partner_id, v_rate
  FROM public.workspaces w
  JOIN public.partners p ON p.id = w.referred_by_partner_id
  WHERE w.id = v_order.workspace_id AND p.status = 'active';

  IF v_partner_id IS NOT NULL THEN
    -- KDV HARİÇ MATRAH. Fiyatlar KDV dahil yayınlanıyor; KDV devlete
    -- gidiyor ve bizim gelirimiz değil. Brüt üzerinden komisyon
    -- ödemek, olmayan bir gelirin payını dağıtmak olurdu.
    -- Formül lib/billing/pricing.ts'teki splitVat ile aynı.
    v_net := ROUND(v_order.gross_kurus / 1.20);

    INSERT INTO public.partner_commissions (
      partner_id, workspace_id, billing_order_id,
      base_kurus, commission_rate, commission_kurus
    )
    VALUES (
      v_partner_id, v_order.workspace_id, p_order_id,
      v_net, v_rate, ROUND(v_net * v_rate)
    )
    ON CONFLICT (billing_order_id) DO NOTHING;
  END IF;

  PERFORM public.log_audit_event(
    v_order.workspace_id, 'billing.order_paid', 'billing_order', p_order_id,
    jsonb_build_object(
      'student_count', v_order.student_count,
      'months', v_order.months,
      'gross_kurus', v_order.gross_kurus,
      'license_ends_at', v_new_end,
      'partner_id', v_partner_id
    )
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'student_limit', v_limit,
    'ends_at', v_new_end
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.settle_billing_order(UUID, TEXT, TEXT) FROM PUBLIC;


-- ------------------------------------------------------------
-- 8) get_partner_overview — partner panelinin tek veri kaynağı
--
-- Getirdiği çalışma alanlarını ve hakedişini döndürür. ÖĞRENCİ VERİSİ,
-- ÖDEME TUTARI VE KULLANICI E-POSTASI YOK: partner bir satış ortağıdır,
-- kiracının verisine ortak değil.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_partner_referrals()
RETURNS TABLE (
  workspace_name   TEXT,
  referred_at      TIMESTAMPTZ,
  has_purchased    BOOLEAN,
  commission_kurus BIGINT,
  commission_status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    w.name,
    w.referred_at,
    EXISTS (
      SELECT 1 FROM public.partner_commissions c
      WHERE c.workspace_id = w.id
    ),
    COALESCE((
      SELECT SUM(c.commission_kurus) FROM public.partner_commissions c
      WHERE c.workspace_id = w.id AND c.status <> 'cancelled'
    ), 0)::BIGINT,
    (
      SELECT c.status FROM public.partner_commissions c
      WHERE c.workspace_id = w.id
      ORDER BY c.created_at DESC LIMIT 1
    )
  FROM public.workspaces w
  WHERE w.referred_by_partner_id = public.current_partner_id()
  ORDER BY w.referred_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_partner_referrals() TO authenticated;


-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.get_partner_referrals();
--   DROP FUNCTION IF EXISTS public.resolve_partner_code(TEXT);
--   DROP FUNCTION IF EXISTS public.current_partner_id();
--   DROP TABLE IF EXISTS public.partner_commissions;
--   ALTER TABLE public.workspaces
--     DROP COLUMN IF EXISTS referred_by_partner_id,
--     DROP COLUMN IF EXISTS referred_at;
--   DROP TABLE IF EXISTS public.partners;
--   -- create_teacher_workspace ve settle_billing_order: 058'e dönülür
-- ============================================================
