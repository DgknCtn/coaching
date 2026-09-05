-- 065 — TABAN BİRİM FİYAT İKİ KATINA ÇIKARILDI
--
-- 058'de 500,00 TL/öğrenci/ay olan taban fiyat 1.000,00 TL'ye alındı.
-- İNDİRİM TABLOLARI DEĞİŞMEDİ; yalnız taban çarpan değişti.
--
-- Fiyat iki yerde hesaplanıyor: burası SUNUCU OTORİTESİDİR (istemci
-- tutar gönderemesin diye), lib/billing/pricing.ts ise arayüzün canlı
-- hesabı. İkisi ayrışırsa müşteri ekranda gördüğünden başka bir tutar
-- öder; tests/pricing-sql-parity.test.ts bu dosyayı okuyup TypeScript
-- sabitleriyle karşılaştırarak ayrışmayı CI'da yakalıyor.
--
-- PARITY blokları O TEST İÇİN var; taşınır ya da silinirlerse test
-- bunu söyler. Süre ve adet tabloları değişmediği hâlde burada TEKRAR
-- yazılıyor: parite testi tek bir dosyaya bakar, tabloların bir kısmı
-- eski migration'da kalırsa test hangi sürümün geçerli olduğunu
-- bilemez.

-- PARITY-BEGIN duration
-- 1:0 2:10 3:15 4:18 5:21 6:25 7:27 8:28 9:30 10:32 11:33 12:35
-- PARITY-END duration
CREATE OR REPLACE FUNCTION public.license_duration_discount(p_months INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_months
    WHEN 1  THEN 0
    WHEN 2  THEN 10
    WHEN 3  THEN 15
    WHEN 4  THEN 18
    WHEN 5  THEN 21
    WHEN 6  THEN 25
    WHEN 7  THEN 27
    WHEN 8  THEN 28
    WHEN 9  THEN 30
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
-- 100000
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
    (100000::NUMERIC * p_students * p_months)
    * ((100 - public.license_duration_discount(p_months))::NUMERIC / 100)
    * ((100 - public.license_volume_discount(p_students))::NUMERIC / 100)
  )::BIGINT;
$fn$;

-- GEÇMİŞ SİPARİŞLERE DOKUNULMAZ: billing_orders.gross_kurus sipariş
-- anında dondurulmuş tutardır. Geriye dönük güncellemek, müşterinin
-- ödediğinden farklı bir rakamı fatura geçmişine yazmak olurdu.
