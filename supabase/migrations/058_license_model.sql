-- ============================================================
-- 058_license_model
--
-- İŞ MODELİ DEĞİŞİYOR: plan tabanlı yinelenen abonelikten
-- ÖN ÖDEMELİ LİSANSA.
--
-- Kullanıcı öğrenci sayısı ve süre seçer, tek seferde öder, lisans o
-- süre boyunca geçerlidir. Öğrenci başına maliyet ikisi de arttıkça
-- düşer.
--
-- NEDEN ABONELİK BIRAKILDI: öğrenci sayısı × ay kombinasyonu sınırsız
-- ve sağlayıcının abonelik ürünü önceden tanımlı fiyat planı istiyor —
-- N×12 için plan üretilemez. 057'de kurulan abonelik altyapısı bu
-- yüzden geri alınıyor.
--
-- ============================================================
-- BU DOSYA BAŞTAN SONA YENİDEN ÇALIŞTIRILABİLİR
--
-- Supabase SQL düzenleyicisi betiği tek işlem olarak sarmalamıyor: bir
-- ifade patlarsa ÖNCEKİLER UYGULANMIŞ olarak kalır. Bu yüzden her ifade
-- IF EXISTS / IF NOT EXISTS ile ya da DROP+CREATE kalıbıyla yazıldı —
-- yarıda kalan bir çalıştırmadan sonra dosyayı baştan çalıştırmak
-- güvenli.
--
-- ============================================================
-- FİYAT TABLOLARI lib/billing/pricing.ts İLE AYNI OLMALI
--
-- Aşağıdaki iki tablo (süre ve adet indirimi) TypeScript tarafındaki
-- DURATION_DISCOUNTS ve VOLUME_DISCOUNTS ile birebir aynıdır. İkisi
-- ayrı yerlerde duruyor çünkü biri sunucunun otoritesi (istemci tutar
-- gönderemesin diye), diğeri arayüzün canlı hesabı.
--
-- AYRIŞIRLARSA müşteri gördüğünden başka bir tutar öder. Bunu önlemek
-- için tests/pricing-sql-parity.test.ts bu dosyayı okuyup sayıları
-- karşılaştırıyor; biri değişip diğeri unutulursa CI kırılır.
-- ============================================================


-- ============================================================
-- 1) DENEME SÜRESİ 7 GÜNE İNİYOR
--
-- MEVCUT DENEME KULLANICILARINA DOKUNULMUYOR: süreleri kısaltmak,
-- kullanıcıya verilmiş bir günü geri almaktır.
-- 7 sayısı lib/plans.ts'teki TRIAL_DAYS ile aynı olmalı.
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

  INSERT INTO public.workspaces (name, type, owner_profile_id, plan, trial_ends_at)
  VALUES (v_ws_name, 'individual', v_profile_id, 'trial', NOW() + INTERVAL '7 days')
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

REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_teacher_workspace(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- 2) ABONELİK ALTYAPISI GERİ ALINIYOR (057)
-- ============================================================

DROP FUNCTION IF EXISTS public.start_trial_subscription(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.mark_subscription_past_due(TEXT, TEXT);
-- Ön ödemeli lisansta iptal edilecek yinelenen bir şey yok.
DROP FUNCTION IF EXISTS public.cancel_subscription(UUID);


-- ============================================================
-- 3) LİSANS TABLOSU
--
-- billing_subscriptions -> workspace_licenses. "Abonelik" ön ödemeli
-- bir üründe yanlış sözcük ve sonraki okuyucuyu yanıltır.
-- ============================================================

ALTER TABLE IF EXISTS public.billing_subscriptions RENAME TO workspace_licenses;

ALTER TABLE public.workspace_licenses
  ADD COLUMN IF NOT EXISTS student_count INTEGER,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- current_period_end -> ends_at (ad, ön ödemeli lisansta daha doğru)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workspace_licenses'
      AND column_name='current_period_end'
  ) THEN
    ALTER TABLE public.workspace_licenses RENAME COLUMN current_period_end TO ends_at;
  END IF;
END $$;

-- Aboneliğe özgü, artık anlamsız sütunlar.
ALTER TABLE public.workspace_licenses
  DROP COLUMN IF EXISTS cancel_at_period_end,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS customer_reference_code,
  DROP COLUMN IF EXISTS period;

-- 057'de tanımlı olan abonelik durumları ('trialing', 'past_due') ön
-- ödemeli lisansta anlamsız. Kısıtı eklemeden ÖNCE mevcut satırlar
-- taşınmalı, yoksa ADD CONSTRAINT ihlal yüzünden patlar.
--
--   trialing  -> cancelled : kart alınmış ama ÖDEME YAPILMAMIŞ. Lisans
--                sayılamaz. Erişim kaybı olmaz; kullanıcı hâlâ
--                workspaces.plan='trial' üzerinden deneme hakkını
--                kullanır (workspace_access_ok).
--   past_due  -> active    : geçmişte ödenmiş bir dönem var ve
--                `ends_at` hâlâ geçerli olabilir. Süresi dolmuşsa
--                zaten `ends_at > NOW()` kontrolüne takılır.
UPDATE public.workspace_licenses SET status = 'cancelled' WHERE status = 'trialing';
UPDATE public.workspace_licenses SET status = 'active'    WHERE status = 'past_due';

-- İKİ ADI DA DÜŞÜR.
--
-- Yalnız eski adı (billing_subscriptions_status_check) düşürmek YETMEZ:
-- migration bir kez çalıştıktan sonra kısıt YENİ adıyla duruyor ve
-- dosyayı tekrar çalıştırmak "already exists" ile patlıyor. Yarıda kalan
-- bir çalıştırmadan sonra baştan çalıştırmak bu dosyanın açık vaadi,
-- dolayısıyla her iki ad da düşürülmeli.
ALTER TABLE public.workspace_licenses
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;

ALTER TABLE public.workspace_licenses
  DROP CONSTRAINT IF EXISTS workspace_licenses_status_check;

ALTER TABLE public.workspace_licenses
  ADD CONSTRAINT workspace_licenses_status_check
  CHECK (status IN ('active', 'expired', 'cancelled'));

-- 'plan' sütunu lisansta anlamsız; öğrenci sayısı otoritedir.
ALTER TABLE public.workspace_licenses DROP COLUMN IF EXISTS plan;

DROP INDEX IF EXISTS uniq_active_subscription;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_license
  ON public.workspace_licenses (workspace_id)
  WHERE status = 'active';

COMMENT ON TABLE public.workspace_licenses IS
  'Ön ödemeli lisans: N öğrenci × M ay, tek çekimle satın alınır. Otomatik yenileme YOKTUR.';


-- ============================================================
-- 4) SİPARİŞ: plan/period -> student_count/months
-- ============================================================

ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS student_count INTEGER,
  ADD COLUMN IF NOT EXISTS months INTEGER;

ALTER TABLE public.billing_orders DROP CONSTRAINT IF EXISTS billing_orders_plan_check;
ALTER TABLE public.billing_orders DROP CONSTRAINT IF EXISTS billing_orders_period_check;
ALTER TABLE public.billing_orders DROP COLUMN IF EXISTS plan;
ALTER TABLE public.billing_orders DROP COLUMN IF EXISTS period;

ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_months_chk;
ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_months_chk CHECK (months IS NULL OR (months >= 1 AND months <= 12));

ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_student_count_chk;
ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_student_count_chk
  CHECK (student_count IS NULL OR student_count >= 1);


-- ============================================================
-- 5) FİYAT HESABI — SUNUCU OTORİTESİ
--
-- Tutar İSTEMCİDEN ALINMAZ. İstemci yalnız öğrenci sayısı ve süre
-- söyler; fiyatı burası belirler. Aksi hâlde 1 kuruşa 12 aylık lisans
-- satın alınabilirdi.
-- ============================================================

-- PARITY-BEGIN duration
-- 1:0 2:10 3:15 4:18 5:21 6:25 7:27 8:28 9:30 10:32 11:33 12:35
-- PARITY-END duration
CREATE OR REPLACE FUNCTION public.license_duration_discount(p_months INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_months
    WHEN 1 THEN 0
    WHEN 2 THEN 10
    WHEN 3 THEN 15
    WHEN 4 THEN 18
    WHEN 5 THEN 21
    WHEN 6 THEN 25
    WHEN 7 THEN 27
    WHEN 8 THEN 28
    WHEN 9 THEN 30
    WHEN 10 THEN 32
    WHEN 11 THEN 33
    WHEN 12 THEN 35
    ELSE 0
  END;
$fn$;

-- PARITY-BEGIN volume
-- 1:0 5:5 10:10 20:15 50:20 100:25
-- PARITY-END volume
CREATE OR REPLACE FUNCTION public.license_volume_discount(p_students INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_students >= 100 THEN 25
    WHEN p_students >= 50  THEN 20
    WHEN p_students >= 20  THEN 15
    WHEN p_students >= 10  THEN 10
    WHEN p_students >= 5   THEN 5
    ELSE 0
  END;
$fn$;

-- PARITY-BEGIN base
-- 50000
-- PARITY-END base
CREATE OR REPLACE FUNCTION public.license_price_kurus(
  p_students INTEGER,
  p_months   INTEGER
)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $fn$
  -- Yuvarlama TEK YERDE, indirim çarpımından sonra — TypeScript
  -- tarafındaki quote() ile aynı sıra. Önce birim fiyatı yuvarlayıp
  -- sonra çarpmak iki tarafta farklı kuruş üretirdi.
  SELECT ROUND(
    (50000::NUMERIC * p_students * p_months)
    * ((100 - public.license_duration_discount(p_months))::NUMERIC / 100)
    * ((100 - public.license_volume_discount(p_students))::NUMERIC / 100)
  )::BIGINT;
$fn$;


-- ------------------------------------------------------------
-- create_billing_order — yeni imza
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_billing_order(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_billing_order(UUID, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.create_billing_order(
  p_workspace_id  UUID,
  p_student_count INTEGER,
  p_months        INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_gross BIGINT;
  v_id    UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_student_count IS NULL OR p_student_count < 1 THEN
    RAISE EXCEPTION 'Geçerli bir öğrenci sayısı girin';
  END IF;

  -- Self-servis üst sınırı; üstü görüşmeye tabi.
  IF p_student_count > 500 THEN
    RAISE EXCEPTION '500 üzeri öğrenci için bizimle iletişime geçin';
  END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
    RAISE EXCEPTION 'Süre 1 ile 12 ay arasında olmalı';
  END IF;

  v_gross := public.license_price_kurus(p_student_count, p_months);

  INSERT INTO public.billing_orders (workspace_id, student_count, months, gross_kurus)
  VALUES (p_workspace_id, p_student_count, p_months, v_gross)
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    p_workspace_id, 'billing.order_created', 'billing_order', v_id,
    jsonb_build_object('student_count', p_student_count, 'months', p_months, 'gross_kurus', v_gross)
  );

  RETURN jsonb_build_object('order_id', v_id, 'gross_kurus', v_gross);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(UUID, INTEGER, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- settle_billing_order — lisansı açar/uzatır
--
-- İDEMPOTENT: sağlayıcı callback'i tekrar gönderebilir; ikinci çağrı
-- bir lisans daha hediye etmemeli.
--
-- SÜRESİ DOLMAMIŞ LİSANSIN ÜSTÜNE EKLER: erken yenileyen kullanıcı
-- kalan günlerini kaybetmemeli.
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
  v_order    public.billing_orders%ROWTYPE;
  v_current  TIMESTAMPTZ;
  v_new_end  TIMESTAMPTZ;
  v_limit    INTEGER;
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

  -- Öğrenci limiti: yeni alım MEVCUDUN ÜSTÜNE ÇIKARSA yükselir, aşağı
  -- İNMEZ. Aksi hâlde 30 öğrencilik lisansı olan biri 5 öğrencilik bir
  -- ek alım yaptığında 25 öğrencisi bir anda limit dışı kalırdı.
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

  PERFORM public.log_audit_event(
    v_order.workspace_id, 'billing.order_paid', 'billing_order', p_order_id,
    jsonb_build_object(
      'student_count', v_order.student_count,
      'months', v_order.months,
      'gross_kurus', v_order.gross_kurus,
      'license_ends_at', v_new_end
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


-- ============================================================
-- 6) ERİŞİM: LİSANS BİTİŞİ DE KAPIYI KAPATIR
--
-- 052'de erişim yalnız deneme süresine bakıyordu. Artık ödeyen
-- kullanıcının da bir bitişi var.
--
-- TEK YARDIMCI: kural üç ayrı yerde tekrarlanırsa biri düzeltilirken
-- diğerleri unutulur ve süresi dolmuş bir lisans bir yoldan içeri
-- girmeye devam eder.
-- ============================================================

CREATE OR REPLACE FUNCTION public.workspace_access_ok(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_workspace_id
      AND w.status = 'active'
      AND (
        -- Denemesi süren
        (w.plan = 'trial' AND w.trial_ends_at IS NOT NULL AND w.trial_ends_at > NOW())
        -- Geçerli lisansı olan
        OR EXISTS (
          SELECT 1 FROM public.workspace_licenses l
          WHERE l.workspace_id = w.id AND l.status = 'active' AND l.ends_at > NOW()
        )
        -- Devralınan/sınırsız kiracılar (052'de grandfathered edilenler):
        -- ne denemede ne lisanslı; kapıda bırakılmamalılar.
        OR (w.plan NOT IN ('trial', 'licensed'))
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.profile_id = public.current_profile_id()
      AND m.status = 'active'
  ) AND public.workspace_access_ok(p_workspace_id);
$fn$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(p_workspace_id UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.workspace_id = p_workspace_id
      AND m.profile_id = public.current_profile_id()
      AND m.status = 'active'
      AND m.role = ANY(p_roles)
  ) AND public.workspace_access_ok(p_workspace_id);
$fn$;


-- ------------------------------------------------------------
-- get_workspace_access_state — 'license_expired' gerekçesi eklendi
--
-- Süresi dolan kiracı RLS gereği kendi çalışma alanını göremez;
-- bu fonksiyon ona NEDEN göremediğini söyler.
--
-- ============================================================
-- DROP GEREKİYOR, CREATE OR REPLACE YETMİYOR
--
-- Fonksiyon yeni bir sütun (license_ends_at) döndürüyor ve PostgreSQL
-- `CREATE OR REPLACE` ile OUT parametrelerinin değişmesine izin vermiyor:
--   "cannot change return type of existing function"
--
-- 052'deki YEDİ SÜTUN KORUNUYOR, kısaltılmıyor: `/erisim` sayfası
-- status, plan ve trial_ends_at alanlarını okuyor. Dört sütuna
-- indirseydik bu alanlar çalışma zamanında sessizce `undefined`
-- olurdu — TypeScript tipi hâlâ var olduklarını söylediği için hata
-- da vermezdi.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_workspace_access_state();

CREATE FUNCTION public.get_workspace_access_state()
RETURNS TABLE (
  workspace_id    UUID,
  workspace_name  TEXT,
  role            TEXT,
  status          TEXT,
  plan            TEXT,
  trial_ends_at   TIMESTAMPTZ,
  license_ends_at TIMESTAMPTZ,
  blocked_reason  TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    w.id,
    w.name,
    m.role::TEXT,
    w.status::TEXT,
    w.plan::TEXT,
    w.trial_ends_at,
    (SELECT l.ends_at FROM public.workspace_licenses l
      WHERE l.workspace_id = w.id AND l.status = 'active'),
    CASE
      WHEN w.status = 'suspended' THEN 'suspended'
      WHEN w.status = 'archived'  THEN 'archived'
      WHEN w.plan = 'trial'
           AND w.trial_ends_at IS NOT NULL
           AND w.trial_ends_at <= NOW() THEN 'trial_expired'
      WHEN w.plan = 'licensed'
           AND NOT EXISTS (
             SELECT 1 FROM public.workspace_licenses l
             WHERE l.workspace_id = w.id AND l.status = 'active' AND l.ends_at > NOW()
           ) THEN 'license_expired'
      ELSE NULL
    END
  FROM public.workspace_members m
  JOIN public.workspaces w ON w.id = m.workspace_id
  WHERE m.profile_id = public.current_profile_id()
    AND m.status = 'active';
$fn$;

GRANT EXECUTE ON FUNCTION public.get_workspace_access_state() TO authenticated;


-- ------------------------------------------------------------
-- get_workspace_usage — lisans bilgisi eklendi
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_workspace_usage(UUID);

CREATE OR REPLACE FUNCTION public.get_workspace_usage(p_workspace_id UUID)
RETURNS TABLE (
  plan              TEXT,
  student_limit     INTEGER,
  active_students   INTEGER,
  trial_ends_at     TIMESTAMPTZ,
  license_starts_at TIMESTAMPTZ,
  license_ends_at   TIMESTAMPTZ,
  license_status    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    w.plan,
    w.student_limit,
    (SELECT COUNT(*)::INTEGER FROM public.students s
      WHERE s.workspace_id = w.id AND s.status = 'active'),
    w.trial_ends_at,
    l.starts_at,
    l.ends_at,
    l.status
  FROM public.workspaces w
  LEFT JOIN public.workspace_licenses l
    ON l.workspace_id = w.id AND l.status = 'active'
  WHERE w.id = p_workspace_id
    AND public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']);
$fn$;

GRANT EXECUTE ON FUNCTION public.get_workspace_usage(UUID) TO authenticated;


-- ============================================================
-- 7) RLS ADI GÜNCELLEMESİ
-- ============================================================

ALTER TABLE public.workspace_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_subscriptions_select ON public.workspace_licenses;
DROP POLICY IF EXISTS workspace_licenses_select ON public.workspace_licenses;
CREATE POLICY workspace_licenses_select ON public.workspace_licenses
  FOR SELECT USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

REVOKE ALL ON public.workspace_licenses FROM anon;
GRANT SELECT ON public.workspace_licenses TO authenticated;


-- ============================================================
-- SÜRESİ DOLAN LİSANSLAR — bilinçli olarak cron YOK
--
-- 052'deki kalıp: süre dolumu SORGU ANINDA değerlendirilir
-- (workspace_access_ok). Bir cron'un gecikmesi, kapanması gereken
-- kiracıyı açık bırakırdı.
--
-- ROLLBACK
--   -- 057'deki sürümlere dönülür; workspace_licenses -> billing_subscriptions
--   -- yeniden adlandırılır ve plan/period sütunları geri eklenir.
-- ============================================================
