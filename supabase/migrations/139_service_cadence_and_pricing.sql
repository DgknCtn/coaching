-- ============================================================
-- 139_service_cadence_and_pricing  (M1.0-02 · Faz 1/3)
--
-- MatMuh M1.0-02 Revizyon Paketi (10 Ekim 2026) §3 ve §11-P0 1-5:
--   "Hizmet Yapısı ne vaat edildiğini tanımlar."
--
-- Bu dosya hizmet kartına üç şey ekler ve öğrenciye bir ücretlendirme
-- modeli + TARİHSEL fiyat sürümleri verir.
--
-- ============================================================
-- 1) HİZMET RİTMİ
-- ============================================================
-- Bugüne kadar her hizmet "haftada 1, şu gün şu saat" idi. Gerçek
-- kullanımda iki durum buna sığmadı:
--   · haftada 2 görüşülen öğrenci (iki ayrı hizmet açmak, aynı hizmeti
--     iki kez saymak demekti);
--   · tarihi her seferinde konuşularak belirlenen ders (ör. Ömer: 17 Mart
--     Salı, 29 Mart Pazar, 12 Nisan Pazar...). Bunlar için takvim
--     ÜRETİLMEZ; oturum elle eklenir (140: create_adhoc_session).
--
-- Gün/saat artık "varsayılan planlama zamanı"dır; tek haftanın
-- değişikliği Hizmet Yapısını değiştirmez (140: reschedule_session).
--
-- ============================================================
-- 2) VARSAYILAN DERS BİRİMİ
-- ============================================================
-- 085 tahakkuku SÜREDEN hesaplıyordu (ücret × dakika / 60). Gerçek
-- kullanımda "2 saatlik ders = 1 ders = 4.000 TL" gibi anlaşmalar var;
-- süreden türetmek bu dersi iki kez fiyatlar. Karar (11 Ekim 2026):
-- birim ELLE seçilir, varsayılanı hizmet kartındadır.
--
-- ============================================================
-- 3) ÜCRETLENDİRME MODELİ VE FİYAT SÜRÜMLERİ
-- ============================================================
-- `student_fees` tek bir sayıydı ve üzerine yazılıyordu: fiyat
-- değiştiğinde geçmiş derslerin hangi fiyattan olduğu kayboluyordu.
-- Doküman §3: "Fiyat değerleri overwrite edilmez. Yeni değer, seçilen
-- geçerlilik tarihinden itibaren yeni fiyat sürümü olarak kaydedilir."
--
--   student_finance_models  — Aylık Sabit / Ders Başı, tahsilat zamanı,
--                             geçerlilik başlangıcı
--   student_price_versions  — aylik / ek_ders / ders_basi tutarları,
--                             geçerlilik başlangıcı
--
-- `valid_to` SAKLANMAZ: bir sonraki sürümün başlangıcından türetilir.
-- Saklansaydı iki satırın aralıkları bir gün tutarsızlaşırdı.
--
-- `student_fees` SİLİNMEZ: 066'nın view'ları ve elle ders girişi hâlâ
-- onu okuyor. `add_price_version` ders_basi fiyatını oraya da yansıtır.
--
-- FİNANS SAHİBE KİLİTLİ (066/068/092 ile aynı): owner RLS, kompozit FK,
-- doğrudan yazma yok, yazma yalnız SECURITY DEFINER RPC.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================


-- ============================================================
-- 1) student_services — ritim, ikinci slot, birim, ana temas, arşiv
-- ============================================================
ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS cadence TEXT NOT NULL DEFAULT 'haftada_1';

ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS weekday_2 SMALLINT;

ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS start_time_2 TIME;

ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS default_unit_count NUMERIC(4,2) NOT NULL DEFAULT 1;

ALTER TABLE public.student_services
  ADD COLUMN IF NOT EXISTS is_main_contact BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_cadence_chk;
ALTER TABLE public.student_services
  ADD CONSTRAINT student_services_cadence_chk
  CHECK (cadence IN ('haftada_1', 'haftada_2', 'esnek'));

-- Haftada 2 ise ikinci gün/saat ZORUNLU; diğerlerinde YASAK. Arayüz
-- doğrulaması unutulsa bile yarım tanımlı bir ritim yazılamaz.
ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_second_slot_chk;
ALTER TABLE public.student_services
  ADD CONSTRAINT student_services_second_slot_chk
  CHECK (
    (cadence = 'haftada_2' AND weekday_2 BETWEEN 1 AND 7 AND start_time_2 IS NOT NULL) OR
    (cadence <> 'haftada_2' AND weekday_2 IS NULL AND start_time_2 IS NULL)
  );

ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_default_unit_chk;
ALTER TABLE public.student_services
  ADD CONSTRAINT student_services_default_unit_chk
  CHECK (default_unit_count > 0 AND default_unit_count <= 20);

-- 'archived': listeden kalkan ama geçmişi korunan hizmet (üç nokta
-- "Arşivle"). Pasiften farkı yalnız görünürlük; oturum üretimi ikisinde
-- de yok.
ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_status_check;
ALTER TABLE public.student_services
  DROP CONSTRAINT IF EXISTS student_services_status_chk;
ALTER TABLE public.student_services
  ADD CONSTRAINT student_services_status_chk
  CHECK (status IN ('active', 'passive', 'archived'));

-- Öğrenci başına en fazla bir elle seçilmiş ana temas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_services_main_contact
  ON public.student_services (student_id)
  WHERE is_main_contact;


-- ============================================================
-- 2) student_finance_models
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_finance_models (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL,
  model        TEXT NOT NULL CHECK (model IN ('aylik_sabit', 'ders_basi')),
  -- Aylık Sabit: ay_basi / ay_sonu. Ders Başı: ders_sonrasi / ay_sonu.
  collection_timing TEXT NOT NULL
    CHECK (collection_timing IN ('ay_basi', 'ay_sonu', 'ders_sonrasi')),
  valid_from   DATE NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_finance_models
  DROP CONSTRAINT IF EXISTS student_finance_models_workspace_student_fkey;
ALTER TABLE public.student_finance_models
  ADD CONSTRAINT student_finance_models_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.student_finance_models
  DROP CONSTRAINT IF EXISTS student_finance_models_timing_chk;
ALTER TABLE public.student_finance_models
  ADD CONSTRAINT student_finance_models_timing_chk
  CHECK (
    (model = 'aylik_sabit' AND collection_timing IN ('ay_basi', 'ay_sonu')) OR
    (model = 'ders_basi'   AND collection_timing IN ('ders_sonrasi', 'ay_sonu'))
  );

-- Aynı gün iki model olamaz; aynı gün yeniden kaydetmek düzeltmedir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_finance_models_day
  ON public.student_finance_models (student_id, valid_from);

ALTER TABLE public.student_finance_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_finance_models_owner ON public.student_finance_models;
CREATE POLICY student_finance_models_owner ON public.student_finance_models
  FOR SELECT
  USING (student_finance_models.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

REVOKE INSERT, UPDATE, DELETE ON public.student_finance_models FROM authenticated;
REVOKE ALL ON public.student_finance_models FROM anon;
GRANT SELECT ON public.student_finance_models TO authenticated;


-- ============================================================
-- 3) student_price_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_price_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL,
  price_type   TEXT NOT NULL CHECK (price_type IN ('aylik', 'ek_ders', 'ders_basi')),
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus BETWEEN 0 AND 100000000),
  valid_from   DATE NOT NULL,
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_price_versions
  DROP CONSTRAINT IF EXISTS student_price_versions_workspace_student_fkey;
ALTER TABLE public.student_price_versions
  ADD CONSTRAINT student_price_versions_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_price_versions_day
  ON public.student_price_versions (student_id, price_type, valid_from);

ALTER TABLE public.student_price_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_price_versions_owner ON public.student_price_versions;
CREATE POLICY student_price_versions_owner ON public.student_price_versions
  FOR SELECT
  USING (student_price_versions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

REVOKE INSERT, UPDATE, DELETE ON public.student_price_versions FROM authenticated;
REVOKE ALL ON public.student_price_versions FROM anon;
GRANT SELECT ON public.student_price_versions TO authenticated;


-- ============================================================
-- 4) Tarihsel okuma yardımcıları
--
-- lib/pricing-history.ts'teki `priceAt` ile AYNI kural: tarih dahil,
-- `valid_from <= tarih` olan EN SON sürüm. Yoksa NULL — "fiyat yok"
-- sıfır TL değildir.
--
-- SECURITY DEFINER DEĞİL: yalnız tetikleyici ve diğer DEFINER
-- fonksiyonların içinden çağrılıyor; dışarıya açılmıyor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.price_at(
  p_student_id UUID,
  p_price_type TEXT,
  p_date       DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  -- PARITY-BEGIN price_at
  SELECT v.amount_kurus
  FROM public.student_price_versions v
  WHERE v.student_id = p_student_id
    AND v.price_type = p_price_type
    AND v.valid_from <= p_date
  ORDER BY v.valid_from DESC, v.created_at DESC
  LIMIT 1;
  -- PARITY-END price_at
$fn$;

REVOKE ALL ON FUNCTION public.price_at(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_model_at(
  p_student_id UUID,
  p_date       DATE
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT m.model
  FROM public.student_finance_models m
  WHERE m.student_id = p_student_id
    AND m.valid_from <= p_date
  ORDER BY m.valid_from DESC, m.created_at DESC
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.finance_model_at(UUID, DATE) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 5) Mevcut ücretlerin taşınması (tek seferlik, idempotent)
--
-- `student_fees` satırı olan öğrenci bugüne kadar fiilen "Ders Başı"
-- çalışıyordu. Fiyat 2000-01-01'den geçerli sayılır: geçmiş bir oturum
-- yeniden senkronlanırsa fiyatsız kalmasın.
--
-- MODEL YALNIZ ders_basi HİZMETİ VEYA TAHAKKUKU OLANA AÇILIR: yalnız
-- 'aylik_paket' hizmeti olan öğrenciye Ders Başı modeli vermek, o
-- hizmetin oturumlarını sessizce ücretli hâle getirirdi.
-- ============================================================
INSERT INTO public.student_price_versions (workspace_id, student_id, price_type, amount_kurus, valid_from)
SELECT f.workspace_id, f.student_id, 'ders_basi', f.per_lesson_kurus, DATE '2000-01-01'
FROM public.student_fees f
ON CONFLICT (student_id, price_type, valid_from) DO NOTHING;

INSERT INTO public.student_finance_models (workspace_id, student_id, model, collection_timing, valid_from)
SELECT f.workspace_id, f.student_id, 'ders_basi', 'ay_sonu', DATE '2000-01-01'
FROM public.student_fees f
WHERE EXISTS (
        SELECT 1 FROM public.student_services sv
        WHERE sv.student_id = f.student_id AND sv.finance_link = 'ders_basi'
      )
   OR EXISTS (
        SELECT 1 FROM public.finance_lessons l WHERE l.student_id = f.student_id
      )
ON CONFLICT (student_id, valid_from) DO NOTHING;


-- ============================================================
-- 6) RPC'ler — ücretlendirme
-- ============================================================

-- Model + o modelin fiyatları TEK işlemle. Ayrı çağrılar olsaydı
-- "Aylık Sabit seçildi ama tutar yazılamadı" yarım durumu mümkün olurdu.
CREATE OR REPLACE FUNCTION public.set_finance_model(
  p_student_id        UUID,
  p_model             TEXT,
  p_collection_timing TEXT,
  p_valid_from        DATE,
  p_main_amount_kurus INTEGER,
  p_extra_amount_kurus INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Ücretlendirmeyi yalnız çalışma alanı sahibi değiştirebilir';
  END IF;
  IF p_model NOT IN ('aylik_sabit', 'ders_basi') THEN
    RAISE EXCEPTION 'Geçersiz ücretlendirme modeli';
  END IF;
  IF p_valid_from IS NULL THEN
    RAISE EXCEPTION 'Geçerlilik başlangıcını seçin';
  END IF;
  IF p_main_amount_kurus IS NULL OR p_main_amount_kurus < 0 OR p_main_amount_kurus > 100000000 THEN
    RAISE EXCEPTION 'Geçersiz tutar';
  END IF;
  IF p_extra_amount_kurus IS NOT NULL
     AND (p_extra_amount_kurus < 0 OR p_extra_amount_kurus > 100000000) THEN
    RAISE EXCEPTION 'Geçersiz ek ders tutarı';
  END IF;

  INSERT INTO public.student_finance_models (
    workspace_id, student_id, model, collection_timing, valid_from, created_by_profile_id
  )
  VALUES (v_workspace, p_student_id, p_model, p_collection_timing, p_valid_from, public.current_profile_id())
  ON CONFLICT (student_id, valid_from) DO UPDATE
    SET model             = EXCLUDED.model,
        collection_timing = EXCLUDED.collection_timing;

  PERFORM public.add_price_version(
    p_student_id,
    CASE WHEN p_model = 'aylik_sabit' THEN 'aylik' ELSE 'ders_basi' END,
    p_main_amount_kurus,
    p_valid_from
  );

  IF p_model = 'aylik_sabit' AND p_extra_amount_kurus IS NOT NULL THEN
    PERFORM public.add_price_version(p_student_id, 'ek_ders', p_extra_amount_kurus, p_valid_from);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_finance_model(UUID, TEXT, TEXT, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_finance_model(UUID, TEXT, TEXT, DATE, INTEGER, INTEGER) TO authenticated;


-- Yeni fiyat sürümü. Aynı gün için yeniden çağrılırsa o günün sürümünü
-- DÜZELTİR (yazım hatası); farklı gün yeni sürümdür.
CREATE OR REPLACE FUNCTION public.add_price_version(
  p_student_id   UUID,
  p_price_type   TEXT,
  p_amount_kurus INTEGER,
  p_valid_from   DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_current   INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Fiyatı yalnız çalışma alanı sahibi değiştirebilir';
  END IF;
  IF p_price_type NOT IN ('aylik', 'ek_ders', 'ders_basi') THEN
    RAISE EXCEPTION 'Geçersiz fiyat türü';
  END IF;
  IF p_amount_kurus IS NULL OR p_amount_kurus < 0 OR p_amount_kurus > 100000000 THEN
    RAISE EXCEPTION 'Geçersiz tutar';
  END IF;
  IF p_valid_from IS NULL THEN
    RAISE EXCEPTION 'Geçerlilik başlangıcını seçin';
  END IF;

  INSERT INTO public.student_price_versions (
    workspace_id, student_id, price_type, amount_kurus, valid_from, created_by_profile_id
  )
  VALUES (v_workspace, p_student_id, p_price_type, p_amount_kurus, p_valid_from, public.current_profile_id())
  ON CONFLICT (student_id, price_type, valid_from) DO UPDATE
    SET amount_kurus = EXCLUDED.amount_kurus;

  -- 066'nın tek-fiyat alanı bugünkü ders başı fiyatını göstermeye devam
  -- etsin (elle ders girişi ve eski view'lar onu okuyor).
  IF p_price_type = 'ders_basi' THEN
    v_current := public.price_at(p_student_id, 'ders_basi', CURRENT_DATE);
    IF v_current IS NOT NULL THEN
      INSERT INTO public.student_fees (student_id, workspace_id, per_lesson_kurus)
      VALUES (p_student_id, v_workspace, v_current)
      ON CONFLICT (student_id) DO UPDATE
        SET per_lesson_kurus = EXCLUDED.per_lesson_kurus;
    END IF;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.add_price_version(UUID, TEXT, INTEGER, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_price_version(UUID, TEXT, INTEGER, DATE) TO authenticated;


-- Hatalı girilmiş bir sürümü geri almak. Geçmişte tahakkuk üretmiş
-- olsa bile tahakkuk satırı kendi tutarını kopyalamıştır; silmek
-- geçmiş borcu değiştirmez.
CREATE OR REPLACE FUNCTION public.delete_price_version(p_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.student_price_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.student_price_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fiyat kaydı bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_row.workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Fiyatı yalnız çalışma alanı sahibi değiştirebilir';
  END IF;
  DELETE FROM public.student_price_versions WHERE id = p_version_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_price_version(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_price_version(UUID) TO authenticated;


-- ============================================================
-- 7) RPC'ler — hizmet kartı
-- ============================================================

-- Hizmet ekleme tek yerde doğrulanır (bugüne kadar istemci doğrudan
-- INSERT ediyordu; ritim kuralları orada ikinci kez yazılırdı).
CREATE OR REPLACE FUNCTION public.create_student_service(
  p_student_id        UUID,
  p_kind              TEXT,
  p_participation     TEXT,
  p_medium            TEXT,
  p_group_id          UUID,
  p_cadence           TEXT,
  p_weekday           SMALLINT,
  p_start_time        TIME,
  p_weekday_2         SMALLINT,
  p_start_time_2      TIME,
  p_duration_minutes  SMALLINT,
  p_start_date        DATE,
  p_finance_link      TEXT,
  p_default_unit      NUMERIC,
  p_submission_offset INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_id        UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF p_cadence NOT IN ('haftada_1', 'haftada_2', 'esnek') THEN
    RAISE EXCEPTION 'Geçersiz ritim.';
  END IF;
  IF p_participation = 'grup' AND p_cadence = 'esnek' THEN
    -- Grup oturumu tek bir ortak kayıttır (083); esnek tarihli grup
    -- dersi her öğrenci için ayrı tarih demek olurdu.
    RAISE EXCEPTION 'Grup dersi esnek ritimle tanımlanamaz.';
  END IF;
  IF p_participation = 'grup' AND p_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = p_group_id AND g.workspace_id = v_workspace
  ) THEN
    RAISE EXCEPTION 'Grup bulunamadı.';
  END IF;

  INSERT INTO public.student_services (
    workspace_id, student_id, kind, participation, medium, group_id,
    cadence, weekday, start_time, weekday_2, start_time_2,
    planned_duration_minutes, start_date, finance_link, default_unit_count,
    submission_offset_minutes, status, created_by_profile_id
  )
  VALUES (
    v_workspace, p_student_id, p_kind, p_participation, p_medium,
    CASE WHEN p_participation = 'grup' THEN p_group_id END,
    p_cadence, p_weekday, p_start_time,
    CASE WHEN p_cadence = 'haftada_2' THEN p_weekday_2 END,
    CASE WHEN p_cadence = 'haftada_2' THEN p_start_time_2 END,
    p_duration_minutes, p_start_date, p_finance_link, COALESCE(p_default_unit, 1),
    COALESCE(p_submission_offset, 0), 'active', public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_student_service(UUID, TEXT, TEXT, TEXT, UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_service(UUID, TEXT, TEXT, TEXT, UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, NUMERIC, INTEGER) TO authenticated;


-- Üç nokta: Ana temas yap. NULL verilirse elle seçim kalkar ve otomatik
-- öncelik (Koçluk > Birebir Ders > Grup Dersi) geri gelir.
CREATE OR REPLACE FUNCTION public.set_main_contact_service(
  p_student_id UUID,
  p_service_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
  IF p_service_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_services
    WHERE id = p_service_id AND student_id = p_student_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Ana temas yalnız aktif bir hizmet olabilir.';
  END IF;

  UPDATE public.student_services
  SET is_main_contact = FALSE
  WHERE student_id = p_student_id AND is_main_contact;

  IF p_service_id IS NOT NULL THEN
    UPDATE public.student_services
    SET is_main_contact = TRUE
    WHERE id = p_service_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_main_contact_service(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_main_contact_service(UUID, UUID) TO authenticated;


-- Pasife al / Aktifleştir / Arşivle. 075'in set_service_status'unun
-- yerini alır (aynı imza, 'archived' eklendi).
CREATE OR REPLACE FUNCTION public.set_service_status(
  p_service_id UUID,
  p_status     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_services WHERE id = p_service_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Hizmet bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_status NOT IN ('active', 'passive', 'archived') THEN
    RAISE EXCEPTION 'Geçersiz hizmet durumu: %', p_status;
  END IF;

  UPDATE public.student_services
  SET status = p_status,
      is_main_contact = CASE WHEN p_status = 'active' THEN is_main_contact ELSE FALSE END
  WHERE id = p_service_id;

  -- Gelecekte bekleyen, henüz yapılmamış oturumlar düşer; geçmiş
  -- kayıtlara dokunulmaz.
  IF p_status IN ('passive', 'archived') THEN
    DELETE FROM public.service_sessions
    WHERE service_id = p_service_id
      AND status = 'planlandi'
      AND planned_at > NOW();
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_service_status(UUID, TEXT) TO authenticated;


-- Üç nokta: Sil — YALNIZ hiç kullanılmamış (yanlış açılmış) hizmet.
-- Gerçekleşmiş, sonuçlanmış ya da elle eklenmiş tek bir oturumu bile
-- olan hizmet silinmez; pasife alınır.
CREATE OR REPLACE FUNCTION public.delete_unused_service(p_service_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_services WHERE id = p_service_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Hizmet bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_sessions
    WHERE service_id = p_service_id
      AND (status <> 'planlandi' OR planned_at <= NOW() OR makeup_of_session_id IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM public.weekly_flows WHERE anchor_service_id = p_service_id
  ) THEN
    RAISE EXCEPTION 'Bu hizmetin kaydı var; silmek yerine pasife alın.';
  END IF;

  DELETE FROM public.service_sessions WHERE service_id = p_service_id;
  DELETE FROM public.student_services WHERE id = p_service_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_unused_service(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_unused_service(UUID) TO authenticated;


-- Üç nokta: Çoğalt — aynı kart, bugünden başlayan yeni bir hizmet.
CREATE OR REPLACE FUNCTION public.duplicate_service(p_service_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src public.student_services%ROWTYPE;
  v_id  UUID;
BEGIN
  SELECT * INTO v_src FROM public.student_services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hizmet bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_src.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  INSERT INTO public.student_services (
    workspace_id, student_id, kind, participation, medium, group_id,
    cadence, weekday, start_time, weekday_2, start_time_2,
    planned_duration_minutes, start_date, finance_link, default_unit_count,
    submission_offset_minutes, status, created_by_profile_id
  )
  VALUES (
    v_src.workspace_id, v_src.student_id, v_src.kind, v_src.participation, v_src.medium, v_src.group_id,
    v_src.cadence, v_src.weekday, v_src.start_time, v_src.weekday_2, v_src.start_time_2,
    v_src.planned_duration_minutes, (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE,
    v_src.finance_link, v_src.default_unit_count,
    v_src.submission_offset_minutes, 'active', public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.duplicate_service(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_service(UUID) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.duplicate_service(UUID);
--   DROP FUNCTION IF EXISTS public.delete_unused_service(UUID);
--   DROP FUNCTION IF EXISTS public.set_main_contact_service(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.create_student_service(UUID, TEXT, TEXT, TEXT, UUID, TEXT, SMALLINT, TIME, SMALLINT, TIME, SMALLINT, DATE, TEXT, NUMERIC, INTEGER);
--   DROP FUNCTION IF EXISTS public.delete_price_version(UUID);
--   DROP FUNCTION IF EXISTS public.add_price_version(UUID, TEXT, INTEGER, DATE);
--   DROP FUNCTION IF EXISTS public.set_finance_model(UUID, TEXT, TEXT, DATE, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.finance_model_at(UUID, DATE);
--   DROP FUNCTION IF EXISTS public.price_at(UUID, TEXT, DATE);
--   DROP TABLE IF EXISTS public.student_price_versions;
--   DROP TABLE IF EXISTS public.student_finance_models;
-- ============================================================
