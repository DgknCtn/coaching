-- ============================================================
-- 067_partner_admin
--
-- PARTNER OLUŞTURMA VE KOMİSYON AYARI — ARAYÜZDEN.
--
-- 059 partner sistemini kurdu ama partner eklemenin tek yolu elle
-- INSERT'tü; app/admin/partnerler/page.tsx bunu bir yorumda tarif
-- ediyordu. Bir anlaşma her yapıldığında veritabanına bağlanmak
-- gerekiyordu: yavaş, hataya açık ve denetim izi bırakmıyor.
--
-- ============================================================
-- KOMİSYON ORANI ZATEN %10 — BU MİGRASYON ONU DEĞİŞTİRMİYOR
--
-- partners.commission_rate DEFAULT 0.10 (059) ve hakediş
-- settle_billing_order içinde, ödeme KESİNLEŞTİKTEN sonra, KDV hariç
-- matrah üzerinden üretiliyor. Buradaki tek yenilik oranın arayüzden
-- görülüp değiştirilebilmesi.
--
-- GEÇMİŞE ETKİ ETMEZ: partner_commissions satırları o anki oranı
-- KENDİ İÇİNDE saklıyor (commission_rate kolonu). Oranı sonradan
-- düşürmek, çoktan hak edilmiş bir komisyonu geri almaz.
-- ============================================================


-- ------------------------------------------------------------
-- 1) generate_partner_code — okunabilir, çakışmayan kod
--
-- Kod telefonda söylenebilmeli ve yazıya geçirilirken karışmamalı, bu
-- yüzden alfabede 0/O ve 1/I/L YOK. 6 karakter × 30 harf ≈ 729 milyon
-- olasılık; çakışma pratikte imkânsız ama yine de 10 kez deneniyor,
-- çünkü "pratikte imkânsız" bir gün üretimde olan şeydir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_partner_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_i INTEGER;
  v_try INTEGER := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_code := '';
    FOR v_i IN 1..6 LOOP
      v_code := v_code || SUBSTR(v_alphabet, 1 + FLOOR(RANDOM() * LENGTH(v_alphabet))::INTEGER, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE code = v_code);

    IF v_try >= 10 THEN
      RAISE EXCEPTION 'Partner kodu üretilemedi, tekrar deneyin';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.generate_partner_code() FROM PUBLIC, anon;


-- ------------------------------------------------------------
-- 2) admin_create_partner
--
-- Kod BOŞ BIRAKILABİLİR: çoğu durumda kodun ne olduğunun bir önemi
-- yok, üretilmesi yeter. Verilirse doğrulanır — partner "benim kodum
-- adım olsun" diyebilir ve bu makul bir istek.
--
-- E-POSTA BENZERSİZLİĞİ ZORLANMIYOR: aynı kişi iki ayrı anlaşmayla iki
-- ayrı kod alabilir (farklı kampanyalar). Zorlamak, gerçek bir iş
-- durumunu veritabanı hatasına çevirirdi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_partner(
  p_name            TEXT,
  p_email           TEXT DEFAULT NULL,
  p_code            TEXT DEFAULT NULL,
  p_commission_rate NUMERIC DEFAULT 0.10,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_code TEXT;
  v_id   UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_name), '') = '' THEN
    RAISE EXCEPTION 'Partner adı zorunlu';
  END IF;

  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RAISE EXCEPTION 'Komisyon oranı 0 ile 1 arasında olmalı';
  END IF;

  v_code := UPPER(TRIM(COALESCE(NULLIF(TRIM(p_code), ''), '')));

  IF v_code = '' THEN
    v_code := public.generate_partner_code();
  ELSE
    -- Aynı kural lib/referral-code.ts'te ve partners.code CHECK'inde.
    -- Burada erken kontrol ediliyor ki kullanıcı ham bir CHECK ihlali
    -- yerine ne yapması gerektiğini söyleyen bir mesaj görsün.
    IF v_code !~ '^[A-Z0-9]{4,20}$' THEN
      RAISE EXCEPTION 'Kod 4-20 karakter olmalı, yalnız harf ve rakam içerebilir';
    END IF;
    IF EXISTS (SELECT 1 FROM public.partners WHERE code = v_code) THEN
      RAISE EXCEPTION 'Bu kod zaten kullanımda';
    END IF;
  END IF;

  INSERT INTO public.partners (code, name, email, commission_rate, notes)
  VALUES (
    v_code,
    TRIM(p_name),
    NULLIF(TRIM(p_email), ''),
    p_commission_rate,
    NULLIF(TRIM(p_notes), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('partner_id', v_id, 'code', v_code);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_create_partner(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 3) admin_update_partner — oran ve durum
--
-- KOD DEĞİŞTİRİLEMEZ ve bu bilinçli: kod paylaşılmış bağlantıların
-- içinde yaşıyor. Değiştirilebilseydi, partnerin daha önce dağıttığı
-- her bağlantı sessizce ölür ve gelen ziyaretçi kimseye yazılmazdı.
-- Yeni bir kod gerekiyorsa yeni bir partner satırı açılır.
--
-- NULL PARAMETRE "DEĞİŞTİRME" DEMEK: arayüz yalnız oranı ya da yalnız
-- durumu güncelleyebilsin diye.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_partner(
  p_partner_id      UUID,
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
  v_rate NUMERIC;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_commission_rate IS NOT NULL
     AND (p_commission_rate < 0 OR p_commission_rate > 1) THEN
    RAISE EXCEPTION 'Komisyon oranı 0 ile 1 arasında olmalı';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;

  UPDATE public.partners
  SET commission_rate = COALESCE(p_commission_rate, commission_rate),
      status          = COALESCE(p_status, status),
      name            = COALESCE(NULLIF(TRIM(p_name), ''), name),
      email           = CASE WHEN p_email IS NULL THEN email
                             ELSE NULLIF(TRIM(p_email), '') END,
      updated_at      = NOW()
  WHERE id = p_partner_id
  RETURNING commission_rate INTO v_rate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner bulunamadı';
  END IF;

  RETURN jsonb_build_object('partner_id', p_partner_id, 'commission_rate', v_rate);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_update_partner(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.admin_update_partner(UUID, NUMERIC, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.admin_create_partner(TEXT, TEXT, TEXT, NUMERIC, TEXT);
--   DROP FUNCTION IF EXISTS public.generate_partner_code();
-- ============================================================
