-- ============================================================
-- 056_billing  —  Faz 6 (Ticarileşme: ödeme)
--
-- SİPARİŞ VE ABONELİK KAYDI.
--
-- MODEL: aylık abonelik (yinelenen, taksitsiz) + yıllık paket (tek çekim,
-- taksitli). Taksit yalnız yıllıkta çünkü taksit tek seferlik bir çekimi
-- böler; yinelenen tahsilatta taksit yapılamaz.
--
-- ============================================================
-- NEDEN SAĞLAYICIDAN BAĞIMSIZ
--
-- Tablolarda "iyzico" geçmiyor. Sağlayıcı `provider` sütununda bir değer,
-- şemanın kendisi değil. Sebep: ödeme sağlayıcısı değiştirmek bir SaaS'ın
-- hayatında olağan bir olaydır (komisyon pazarlığı, kesinti, kapsam
-- değişikliği) ve şemaya gömülmüş bir sağlayıcı adı o günü bir göç
-- projesine çevirir.
--
-- NEDEN PARA TAM SAYI
--
-- Tutarlar KURUŞ cinsinden BIGINT. NUMERIC de doğru olurdu ama uygulama
-- katmanı zaten kuruş tam sayısıyla çalışıyor (lib/billing/pricing.ts);
-- iki katmanın aynı temsili kullanması, dönüşüm sırasında kuruş
-- kaybetme ihtimalini tamamen kaldırıyor. FLOAT hiçbir koşulda kullanılmaz.
--
-- NEDEN KART BİLGİSİ YOK
--
-- Bu şemada kart numarası, son kullanma tarihi ya da CVC tutan hiçbir alan
-- YOKTUR ve olmamalıdır. Kart verisi sağlayıcının ödeme sayfasında kalır;
-- bize yalnız sağlayıcının ürettiği referanslar döner. Kart verisini
-- kendimize almak PCI-DSS kapsamına girmek demektir ve bu ürünün
-- taşıyabileceği bir yük değil.
-- ============================================================

-- ------------------------------------------------------------
-- 1) billing_orders — bir ödeme girişimi
--
-- Her "Ödemeye geç" tıklaması burada bir satır açar. Başarısız girişimler
-- de KALIR: "neden ödeyemedim" sorusunun cevabı ancak başarısız denemeler
-- görünürse verilebilir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Sağlayıcı adı; şema hiçbir sağlayıcıya bağlı değil.
  provider        TEXT NOT NULL DEFAULT 'iyzico',

  plan            TEXT NOT NULL CHECK (plan IN ('starter', 'coach')),
  period          TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),

  -- KDV DAHİL brüt tutar (kuruş). Yayınlanan fiyat KDV dahildir.
  gross_kurus     BIGINT NOT NULL CHECK (gross_kurus > 0),
  currency        TEXT NOT NULL DEFAULT 'TRY',

  -- Kaç taksit seçildi. Tek çekim = 1. Yalnız yıllıkta 1'den büyük olabilir.
  installment     INTEGER NOT NULL DEFAULT 1 CHECK (installment >= 1),

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),

  -- Sağlayıcının oturum belirteci (checkout form token). Callback bu
  -- belirteci taşır; siparişi onunla buluyoruz.
  provider_token  TEXT,
  -- Ödeme gerçekleştiğinde sağlayıcının ödeme kimliği. İade ve mutabakat
  -- için tek bağ noktası.
  provider_payment_id TEXT,
  -- Başarısızlıkta sağlayıcının döndüğü hata; kullanıcıya değil, desteğe.
  failure_reason  TEXT,

  -- Taksit yalnız yıllıkta: kural veritabanında da duruyor, çünkü
  -- uygulama katmanındaki kontrol PostgREST'e doğrudan istek atan
  -- istemci tarafından atlanır (049'un dersi).
  CONSTRAINT billing_orders_installment_chk CHECK (
    installment = 1 OR period = 'yearly'
  ),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_orders_workspace
  ON public.billing_orders (workspace_id, created_at DESC);

-- Belirteç benzersiz olmalı: aynı belirteçle gelen ikinci bir callback
-- ikinci bir ödeme kaydı üretmemeli.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_orders_token
  ON public.billing_orders (provider, provider_token)
  WHERE provider_token IS NOT NULL;

DROP TRIGGER IF EXISTS handle_updated_at ON public.billing_orders;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.billing_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 2) billing_subscriptions — çalışma alanının yürürlükteki hakkı
--
-- Çalışma alanı başına EN FAZLA BİR aktif abonelik. Aynı anda iki plan
-- taşımak, hangi limitin geçerli olduğunu belirsizleştirir.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  provider        TEXT NOT NULL DEFAULT 'iyzico',
  -- Yinelenen aylık abonelikte sağlayıcının abonelik referansı.
  -- Yıllık tek çekimde NULL: orada yenileme sağlayıcıda değil bizde.
  provider_reference TEXT,

  plan            TEXT NOT NULL CHECK (plan IN ('starter', 'coach')),
  period          TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),

  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),

  -- Erişimin bittiği an. RLS bunu okur; sağlayıcıya sormaz.
  current_period_end TIMESTAMPTZ NOT NULL,

  -- İptal edildiğinde erişim HEMEN kesilmez: ödenen dönemin sonuna kadar
  -- sürer. Parasını ödediği günü kullanıcıdan geri almak, iptali
  -- cezalandırmaktır.
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_subscription
  ON public.billing_subscriptions (workspace_id)
  WHERE status IN ('active', 'past_due');

DROP TRIGGER IF EXISTS handle_updated_at ON public.billing_subscriptions;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- 3) RLS
--
-- OKUMA: yalnız sahip. Faturalama bilgisi öğretmene bile gösterilmez —
-- kurumda çalışan bir öğretmenin kurumun ne ödediğini görmesi gerekmiyor.
-- YAZMA: politika YOK. Yalnızca aşağıdaki SECURITY DEFINER fonksiyonlar
-- ve sunucu tarafı callback yazabilir; bir istemcinin kendi kaydını
-- 'paid' yapabilmesi, bedava abonelik demektir.
-- ------------------------------------------------------------
ALTER TABLE public.billing_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_orders_select ON public.billing_orders;
CREATE POLICY billing_orders_select ON public.billing_orders
  FOR SELECT USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

DROP POLICY IF EXISTS billing_subscriptions_select ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_select ON public.billing_subscriptions
  FOR SELECT USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

REVOKE ALL ON public.billing_orders        FROM anon;
REVOKE ALL ON public.billing_subscriptions FROM anon;
GRANT SELECT ON public.billing_orders        TO authenticated;
GRANT SELECT ON public.billing_subscriptions TO authenticated;

-- ------------------------------------------------------------
-- 4) create_billing_order
--
-- Ödeme başlatmadan önce siparişi açar. TUTAR İSTEMCİDEN ALINMAZ:
-- plan ve dönem alınır, fiyat sunucunun bildiği fiyattır. Aksi hâlde
-- istemci 1 kuruşa yıllık plan satın alırdı.
--
-- Fiyat tablosu buraya GÖMÜLÜ, lib/billing/pricing.ts ile aynı sayılar.
-- İki yerde durması hoş değil ama alternatifi, tutarı istemciden almak ya
-- da fiyatı ayrı bir tabloya taşıyıp her fiyat değişikliğini migration'a
-- bağlamaktı. Fiyat değişiminde İKİSİ BİRLİKTE güncellenmeli; test bunu
-- kilitliyor (tests/pricing.test.ts fiyatları, bu fonksiyon sayıları).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_billing_order(
  p_workspace_id UUID,
  p_plan         TEXT,
  p_period       TEXT,
  p_installment  INTEGER DEFAULT 1
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
  -- Faturalama kararı çalışma alanının SAHİBİNE aittir.
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_plan NOT IN ('starter', 'coach') THEN
    RAISE EXCEPTION 'Geçersiz plan';
  END IF;

  IF p_period NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Geçersiz dönem';
  END IF;

  IF p_installment < 1 THEN
    RAISE EXCEPTION 'Geçersiz taksit sayısı';
  END IF;

  IF p_installment > 1 AND p_period <> 'yearly' THEN
    RAISE EXCEPTION 'Taksit yalnız yıllık pakette kullanılabilir';
  END IF;

  v_gross := CASE
    WHEN p_plan = 'starter' AND p_period = 'monthly' THEN 49900
    WHEN p_plan = 'starter' AND p_period = 'yearly'  THEN 499000
    WHEN p_plan = 'coach'   AND p_period = 'monthly' THEN 99900
    WHEN p_plan = 'coach'   AND p_period = 'yearly'  THEN 999000
  END;

  INSERT INTO public.billing_orders (
    workspace_id, plan, period, gross_kurus, installment
  )
  VALUES (p_workspace_id, p_plan, p_period, v_gross, p_installment)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    p_workspace_id, 'billing.order_created', 'billing_order', v_id,
    jsonb_build_object('plan', p_plan, 'period', p_period, 'gross_kurus', v_gross)
  );

  RETURN jsonb_build_object('order_id', v_id, 'gross_kurus', v_gross);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(UUID, TEXT, TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 5) settle_billing_order
--
-- Ödeme doğrulandıktan SONRA çağrılır: siparişi kapatır, aboneliği açar
-- ya da uzatır, çalışma alanının planını ve limitini günceller.
--
-- BU FONKSİYON authenticated'A AÇILMAZ. Yalnız sunucu tarafındaki
-- callback rotası, sağlayıcının imzasını doğruladıktan sonra çağırır.
-- İstemciye açık olsaydı herkes kendi aboneliğini bedavaya açardı.
--
-- FİKİR AYNI KALSIN DİYE: fonksiyon İDEMPOTENT. Aynı sipariş iki kez
-- kapatılırsa ikinci çağrı hiçbir şey yapmaz. Sağlayıcılar callback'i
-- tekrar gönderir; tekrar gönderim bir yıl daha abonelik hediye etmemeli.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_billing_order(
  p_order_id           UUID,
  p_provider_payment_id TEXT,
  p_provider_reference  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_order   public.billing_orders%ROWTYPE;
  v_limit   INTEGER;
  v_extend  INTERVAL;
  v_current TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM public.billing_orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sipariş bulunamadı';
  END IF;

  -- İDEMPOTENS: tekrarlanan callback ikinci kez abonelik uzatmamalı.
  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'already_settled', true);
  END IF;

  UPDATE public.billing_orders
  SET status = 'paid',
      provider_payment_id = p_provider_payment_id,
      paid_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  v_extend := CASE v_order.period
    WHEN 'monthly' THEN INTERVAL '1 month'
    ELSE INTERVAL '1 year'
  END;

  -- Süresi henüz dolmamış bir abonelik varsa üstüne EKLENİR, sıfırlanmaz:
  -- erken yenileyen kullanıcı kalan günlerini kaybetmemeli.
  SELECT current_period_end INTO v_current
  FROM public.billing_subscriptions
  WHERE workspace_id = v_order.workspace_id
    AND status IN ('active', 'past_due');

  v_new_end := GREATEST(COALESCE(v_current, NOW()), NOW()) + v_extend;

  IF v_current IS NULL THEN
    INSERT INTO public.billing_subscriptions (
      workspace_id, provider, provider_reference, plan, period,
      status, current_period_end
    )
    VALUES (
      v_order.workspace_id, v_order.provider, p_provider_reference,
      v_order.plan, v_order.period, 'active', v_new_end
    );
  ELSE
    UPDATE public.billing_subscriptions
    SET plan = v_order.plan,
        period = v_order.period,
        status = 'active',
        current_period_end = v_new_end,
        cancel_at_period_end = FALSE,
        cancelled_at = NULL,
        provider_reference = COALESCE(p_provider_reference, provider_reference),
        updated_at = NOW()
    WHERE workspace_id = v_order.workspace_id
      AND status IN ('active', 'past_due');
  END IF;

  v_limit := CASE v_order.plan WHEN 'starter' THEN 10 WHEN 'coach' THEN 30 END;

  -- Çalışma alanını açar: deneme süresi bitmiş olsa bile artık ödenmiş
  -- bir hakkı var. trial_ends_at temizlenir, yoksa 052'deki RLS yardımcısı
  -- kiracıyı hâlâ süresi dolmuş sayardı.
  UPDATE public.workspaces
  SET plan = v_order.plan,
      student_limit = v_limit,
      trial_ends_at = NULL,
      status = 'active',
      updated_at = NOW()
  WHERE id = v_order.workspace_id;

  PERFORM public.log_audit_event(
    v_order.workspace_id, 'billing.order_paid', 'billing_order', p_order_id,
    jsonb_build_object(
      'plan', v_order.plan,
      'period', v_order.period,
      'gross_kurus', v_order.gross_kurus,
      'period_end', v_new_end
    )
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'plan', v_order.plan,
    'current_period_end', v_new_end
  );
END;
$fn$;

-- authenticated'a GRANT YOK — bilinçli. Yalnız servis tarafı çağırır.
REVOKE ALL ON FUNCTION public.settle_billing_order(UUID, TEXT, TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6) fail_billing_order — başarısız girişimi kaydeder
--
-- Başarısızlık SESSİZ GEÇİLMEZ: "neden ödeyemedim" sorusunun cevabı
-- ancak başarısız denemeler görünürse verilebilir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_billing_order(
  p_order_id UUID,
  p_reason   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  UPDATE public.billing_orders
  SET status = 'failed',
      failure_reason = LEFT(COALESCE(p_reason, ''), 500),
      updated_at = NOW()
  WHERE id = p_order_id AND status = 'pending';
END;
$fn$;

REVOKE ALL ON FUNCTION public.fail_billing_order(UUID, TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- 7) cancel_subscription
--
-- Erişim HEMEN kesilmez: ödenen dönemin sonuna kadar sürer. Parasını
-- ödediği günü kullanıcıdan geri almak, iptali cezalandırmaktır — ve
-- iptali zorlaştırmak, mesafeli satış mevzuatına da aykırıdır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_subscription(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_end TIMESTAMPTZ;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  UPDATE public.billing_subscriptions
  SET cancel_at_period_end = TRUE, cancelled_at = NOW(), updated_at = NOW()
  WHERE workspace_id = p_workspace_id AND status IN ('active', 'past_due')
  RETURNING current_period_end INTO v_end;

  IF v_end IS NULL THEN
    RAISE EXCEPTION 'İptal edilecek aktif abonelik yok';
  END IF;

  PERFORM public.log_audit_event(
    p_workspace_id, 'billing.subscription_cancelled', 'workspace', p_workspace_id,
    jsonb_build_object('access_until', v_end)
  );

  RETURN jsonb_build_object('access_until', v_end);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.cancel_subscription(UUID) TO authenticated;

-- ============================================================
-- SÜRESİ DOLAN ABONELİKLER — bilinçli olarak cron YOK
--
-- 052'deki kalıp burada da geçerli: süre dolumu SORGU ANINDA
-- değerlendirilir. Aşağıdaki sorgu, kapatılması gereken çalışma
-- alanlarını verir ve ileride bir zamanlanmış işe bağlanabilir:
--
--   SELECT workspace_id FROM public.billing_subscriptions
--   WHERE status = 'active' AND current_period_end < NOW();
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.cancel_subscription(UUID);
--   DROP FUNCTION IF EXISTS public.fail_billing_order(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.settle_billing_order(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.create_billing_order(UUID, TEXT, TEXT, INTEGER);
--   DROP TABLE IF EXISTS public.billing_subscriptions;
--   DROP TABLE IF EXISTS public.billing_orders;
-- ============================================================
