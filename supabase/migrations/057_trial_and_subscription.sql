-- ============================================================
-- 057_trial_and_subscription
--
-- ÜÇ İŞ: (1) çalışmayan deneme süresini düzelt, (2) taksidi kaldır,
-- (3) yinelenen abonelik için alan aç.
-- ============================================================


-- ============================================================
-- 1) DENEME SÜRESİ HİÇ DOLMUYORDU  —  P0
--
-- HATA: create_teacher_workspace (024) `trial_ends_at` yazmıyor ve
-- sütunun varsayılanı da yok. Yani her yeni çalışma alanı
-- `trial_ends_at = NULL` kalıyordu. 052'deki RLS yardımcıları şunu
-- soruyor:
--
--   w.plan <> 'trial' OR w.trial_ends_at IS NULL OR w.trial_ends_at > NOW()
--
-- `NULL` ortadaki koşulu doğrulayıp kısa devre yapıyor; erişim süresiz
-- açık kalıyor. `TRIAL_DAYS = 14` (lib/plans.ts) tanımlıydı ama hiçbir
-- yere bağlı değildi. Deneme süresi bugüne kadar ürünün hiçbir yerinde
-- fiilen işlemedi.
--
-- Otomatik tahsilat bu düzelmeden anlamsız: çekilecek bir "deneme sonu"
-- yok.
--
-- 14 SAYISI lib/plans.ts'teki TRIAL_DAYS ile AYNI OLMALIDIR. İkisi ayrı
-- yerlerde duruyor çünkü biri veritabanı varsayılanı, diğeri arayüz
-- metni; değiştirilirken ikisi birlikte değiştirilmeli.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_teacher_workspace(
  p_auth_user_id  UUID,
  p_full_name     TEXT,
  p_email         TEXT,
  p_workspace_name TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id    UUID;
  v_workspace_id  UUID;
  v_ws_name       TEXT;
BEGIN
  -- Kimlik istemciye emanet edilemez: yalnızca oturum sahibi kendi
  -- profilini oluşturabilir.
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

  -- TEK DEĞİŞİKLİK: trial_ends_at artık yazılıyor.
  INSERT INTO public.workspaces (name, type, owner_profile_id, plan, trial_ends_at)
  VALUES (
    v_ws_name, 'individual', v_profile_id,
    'trial',
    NOW() + INTERVAL '14 days'
  )
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'owner', 'active');

  -- Aynı kişi hem sahip hem öğretmen.
  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_workspace_id, v_profile_id, 'teacher', 'active');

  UPDATE public.profiles
  SET default_workspace_id = v_workspace_id
  WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'profile_id',   v_profile_id,
    'workspace_id', v_workspace_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- MEVCUT DENEME KULLANICILARI.
--
-- Süre BUGÜNDEN başlatılıyor, kayıt tarihinden DEĞİL. Kayıt tarihinden
-- saymak, bugüne kadar sınırsız kullanmış bir kullanıcıyı bu migration
-- uygulanır uygulanmaz kapıda bırakırdı — kendi hatamızın faturasını
-- kullanıcıya kesmek olurdu.
UPDATE public.workspaces
SET trial_ends_at = NOW() + INTERVAL '14 days'
WHERE plan = 'trial' AND trial_ends_at IS NULL;


-- ============================================================
-- 2) TAKSİT KALDIRILDI
--
-- Ürün kararı tek çekim. Teknik olarak da zorunlu hâle geldi: yinelenen
-- abonelikte taksit yapılamaz, çünkü taksit tek seferlik bir çekimi
-- böler.
--
-- Sütun DÜŞÜRÜLÜYOR, "hep 1 kalsın" diye bırakılmıyor: kullanılmayan bir
-- sütun, sonraki okuyucuya hâlâ desteklenen bir özellik gibi görünür.
-- Geçmiş siparişlerde taksit bilgisi kaybolur; bu kabul edilebilir,
-- çünkü canlı satış henüz başlamadı.
-- ============================================================

ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_installment_chk;

ALTER TABLE public.billing_orders
  DROP COLUMN IF EXISTS installment;

-- Eski imza (p_installment'lı) düşürülmeli, yoksa aşırı yükleme olarak
-- yaşamaya devam eder ve PostgREST hangisini çağıracağını bilemez.
DROP FUNCTION IF EXISTS public.create_billing_order(UUID, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.create_billing_order(
  p_workspace_id UUID,
  p_plan         TEXT,
  p_period       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_gross  BIGINT;
  v_id     UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_plan NOT IN ('starter', 'coach') THEN
    RAISE EXCEPTION 'Geçersiz plan';
  END IF;

  IF p_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Geçersiz dönem';
  END IF;

  -- Tutar İSTEMCİDEN ALINMAZ: plan ve dönem alınır, fiyatı sunucu bilir.
  -- Aksi hâlde istemci 1 kuruşa yıllık plan satın alırdı.
  -- Sayılar lib/billing/pricing.ts ile aynı olmalı.
  v_gross := CASE
    WHEN p_plan = 'starter' AND p_period = 'monthly' THEN 49900
    WHEN p_plan = 'starter' AND p_period = 'yearly'  THEN 499000
    WHEN p_plan = 'coach'   AND p_period = 'monthly' THEN 99900
    WHEN p_plan = 'coach'   AND p_period = 'yearly'  THEN 999000
  END;

  INSERT INTO public.billing_orders (workspace_id, plan, period, gross_kurus)
  VALUES (p_workspace_id, p_plan, p_period, v_gross)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    p_workspace_id, 'billing.order_created', 'billing_order', v_id,
    jsonb_build_object('plan', p_plan, 'period', p_period, 'gross_kurus', v_gross)
  );

  RETURN jsonb_build_object('order_id', v_id, 'gross_kurus', v_gross);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(UUID, TEXT, TEXT) TO authenticated;


-- ============================================================
-- 3) YİNELENEN ABONELİK ALANLARI
--
-- Kart kayıtta alınır, deneme bitince sağlayıcı OTOMATİK çeker.
-- Sağlayıcı iki referans üretir: müşteri ve abonelik. İkisi de saklanır
-- çünkü iptal ve sorgulama uçları ikisini birden ister.
--
-- KART VERİSİ YİNE HİÇBİR YERDE YOK: kart, sağlayıcının barındırılan
-- formunda kalır. Bize yalnız referans kodları döner. Bu, PCI-DSS
-- kapsamına girmemenin tek yolu.
-- ============================================================

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS customer_reference_code TEXT;

COMMENT ON COLUMN public.billing_subscriptions.customer_reference_code IS
  'Sağlayıcıdaki müşteri referansı. provider_reference ise abonelik referansıdır; iptal ve sorgulama uçları ikisini de ister.';

-- Deneme aşamasındaki abonelik: kart alındı, henüz tahsilat yok.
-- 'active' demek yanlış olurdu (para geçmedi), 'past_due' de yanlış
-- (gecikmiş bir ödeme yok).
ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired'));

-- 'trialing' de aktif sayılır: aynı anda iki abonelik taşımak, hangi
-- limitin geçerli olduğunu belirsizleştirir.
DROP INDEX IF EXISTS uniq_active_subscription;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_subscription
  ON public.billing_subscriptions (workspace_id)
  WHERE status IN ('trialing', 'active', 'past_due');

-- Sipariş de deneme aşamasında açılabilir.
ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_status_check;

ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_status_check
  CHECK (status IN ('pending', 'trialing', 'paid', 'failed', 'cancelled'));


-- ------------------------------------------------------------
-- start_trial_subscription
--
-- Kart alındıktan SONRA çağrılır: aboneliği 'trialing' olarak açar.
-- Para geçmediği için workspaces.plan'a DOKUNULMAZ — kullanıcı hâlâ
-- denemede ve limiti deneme limiti. Plan yükseltmesi ilk gerçek
-- tahsilatta (settle_billing_order) olur.
--
-- İDEMPOTENT: aynı abonelik referansı ikinci kez gelirse hiçbir şey
-- yapmaz. Sağlayıcı callback'i tekrar gönderebilir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_trial_subscription(
  p_workspace_id   UUID,
  p_plan           TEXT,
  p_period         TEXT,
  p_subscription_reference TEXT,
  p_customer_reference     TEXT,
  p_trial_ends_at  TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_existing UUID;
BEGIN
  IF p_plan NOT IN ('starter', 'coach') THEN
    RAISE EXCEPTION 'Geçersiz plan';
  END IF;
  IF p_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Geçersiz dönem';
  END IF;

  SELECT id INTO v_existing
  FROM public.billing_subscriptions
  WHERE workspace_id = p_workspace_id
    AND status IN ('trialing', 'active', 'past_due');

  IF v_existing IS NOT NULL THEN
    -- Zaten bir abonelik var: referansları tazeler, dönem sonunu
    -- İLERİ ÇEKMEZ. Tekrarlanan callback deneme süresini uzatmamalı.
    UPDATE public.billing_subscriptions
    SET provider_reference = p_subscription_reference,
        customer_reference_code = p_customer_reference,
        plan = p_plan,
        period = p_period,
        updated_at = NOW()
    WHERE id = v_existing;

    RETURN jsonb_build_object('subscription_id', v_existing, 'already_existed', true);
  END IF;

  INSERT INTO public.billing_subscriptions (
    workspace_id, provider, provider_reference, customer_reference_code,
    plan, period, status, current_period_end
  )
  VALUES (
    p_workspace_id, 'iyzico', p_subscription_reference, p_customer_reference,
    p_plan, p_period, 'trialing', p_trial_ends_at
  )
  RETURNING id INTO v_existing;

  PERFORM public.log_audit_event(
    p_workspace_id, 'billing.trial_started', 'billing_subscription', v_existing,
    jsonb_build_object('plan', p_plan, 'period', p_period, 'trial_ends_at', p_trial_ends_at)
  );

  RETURN jsonb_build_object('subscription_id', v_existing);
END;
$fn$;

-- authenticated'a GRANT YOK: yalnız sunucu tarafı, sağlayıcının imzası
-- doğrulandıktan sonra çağırır.
REVOKE ALL ON FUNCTION public.start_trial_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;


-- ------------------------------------------------------------
-- mark_subscription_past_due
--
-- Yenileme ödemesi başarısız olduğunda. Erişim HEMEN kesilmez:
-- 052'deki RLS `current_period_end`'e değil workspace durumuna bakıyor
-- ve kart bir sonraki denemede geçebilir. Kartı geçici sorunlu diye
-- kullanıcıyı anında dışarı atmak, ödemeye niyetli müşteriyi kaybetmek
-- olur.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_subscription_past_due(
  p_subscription_reference TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  UPDATE public.billing_subscriptions
  SET status = 'past_due', updated_at = NOW()
  WHERE provider_reference = p_subscription_reference
    AND status IN ('trialing', 'active')
  RETURNING workspace_id INTO v_workspace_id;

  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.log_audit_event(
      v_workspace_id, 'billing.payment_failed', 'billing_subscription', NULL,
      jsonb_build_object('reason', LEFT(COALESCE(p_reason, ''), 300))
    );
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_subscription_past_due(TEXT, TEXT) FROM PUBLIC;


-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.mark_subscription_past_due(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.start_trial_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
--   ALTER TABLE public.billing_subscriptions DROP COLUMN IF EXISTS customer_reference_code;
--   ALTER TABLE public.billing_orders ADD COLUMN installment INTEGER NOT NULL DEFAULT 1;
--   -- create_teacher_workspace: 024'teki sürüme dönülür (trial_ends_at yazmayan)
-- ============================================================
