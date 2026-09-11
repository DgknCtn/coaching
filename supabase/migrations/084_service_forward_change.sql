-- ============================================================
-- 084_service_forward_change
--
-- R7 / Site Testi 04 Rev.3 · §5 no.2 ve no.7, kabul maddesi:
--   "Kalıcı program değişikliği yalnız belirtilen tarihten sonrasını
--    etkiliyor."
--   "Değişiklikler belirtilen başlangıç tarihinden itibaren uygulanır;
--    geçmiş gerçekleşmiş kayıtlar değişmez."
--
-- ============================================================
-- SORUN: HİZMETİ DÜZENLEMENİN HİÇBİR YOLU YOKTU
-- ============================================================
-- 074/075 yalnız üç yol veriyor: EKLE, PASİFE AL, AKTİFLEŞTİR.
-- "Grup dersi Çarşamba 20:00'den Perşembe 19:00'a alındı" gibi sıradan
-- bir değişiklik için öğretmenin elinde tek seçenek vardı: eski hizmeti
-- pasife alıp yenisini eklemek. O zaman da aylık sayaç iki ayrı hizmet
-- hattı görüyor ve "Grup 4/5" yerine "Grup 2/2 + Grup 2/3" yazıyordu.
--
-- ============================================================
-- ÇÖZÜM: DEĞİŞİKLİK BİR TARİHTEN İTİBAREN
-- ============================================================
-- `start_date` yeni düzenin başladığı gün olur. Geçmiş oturumlar zaten
-- satır olarak duruyor ve dokunulmuyor; değişen yalnız BUNDAN SONRA
-- üretilecek oturumların deseni.
--
-- ARADA KALAN OTURUMLAR TEMİZLENİR: eski desenle üretilmiş ama henüz
-- GERÇEKLEŞMEMİŞ (`planlandi`) ileri tarihli satırlar silinir, çünkü
-- artık var olmayan bir programı gösteriyorlar. Tembel üretici onları
-- yeni desenle yeniden açar.
--
-- ÜÇ ŞEY ASLA SİLİNMEZ:
--
--   1. SONUÇLANMIŞ OTURUM (yapildi / yapilmadi / ertelendi / iptal).
--      Gerçekleşmiş hizmet kaydıdır; §5 no.7 onu açıkça koruyor.
--
--   2. GEÇMİŞTE KALMIŞ 'planlandi' SATIRI. Bunlar ekranda "Durum
--      güncellenmedi" diye duran ve öğretmenin hâlâ karar vermesi
--      gereken oturumlar (§7-B). Silmek, cevaplanmamış bir soruyu
--      ortadan kaldırmak olurdu.
--
--   3. TELAFİ SATIRI. Telafi haftalık desenden değil, öğretmenin tek
--      seferlik kararından doğdu; desen değişti diye kaybolmamalı.
--
-- GRUP OTURUMU BİLİNÇLİ OLARAK SİLİNMİYOR: `group_sessions` satırı
-- gruptaki DİĞER öğrencilere de bağlı. Bir öğrencinin programı
-- değiştiği için ortak kaydı silmek, kalan öğrencilerin dersini
-- ortadan kaldırırdı. Öğrencinin kendi satırı düşer, grup kaydı kalır.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_student_service(
  p_service_id        UUID,
  p_weekday           SMALLINT,
  p_start_time        TIME,
  p_duration_minutes  SMALLINT,
  p_effective_from    DATE,
  p_medium            TEXT DEFAULT NULL,
  p_finance_link      TEXT DEFAULT NULL,
  p_submission_offset SMALLINT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_service public.student_services%ROWTYPE;
  v_cutoff  TIMESTAMPTZ;
  v_removed INTEGER := 0;
BEGIN
  SELECT * INTO v_service FROM public.student_services WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hizmet bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_service.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_weekday IS NULL OR p_weekday < 1 OR p_weekday > 7 THEN
    RAISE EXCEPTION 'Geçerli bir gün seçin.';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 5 OR p_duration_minutes > 600 THEN
    RAISE EXCEPTION 'Süre 5 ile 600 dakika arasında olmalı.';
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Değişikliğin başlayacağı tarihi seçin.';
  END IF;

  IF p_medium IS NOT NULL AND p_medium NOT IN ('online', 'yuz_yuze') THEN
    RAISE EXCEPTION 'Geçersiz ortam.';
  END IF;

  IF p_finance_link IS NOT NULL
     AND p_finance_link NOT IN ('aylik_paket', 'ders_basi', 'haric') THEN
    RAISE EXCEPTION 'Geçersiz finans ilişkisi.';
  END IF;

  -- HİZMET EKSENLERİ DEĞİŞTİRİLEMEZ: ders/koçluk ve birebir/grup
  -- ayrımı, aylık sayaçların ve ana temas önceliğinin dayandığı şey.
  -- Değişmesi gerekiyorsa o artık BAŞKA bir hizmettir: eskisi pasife
  -- alınır, yenisi eklenir (§5 no.1).
  UPDATE public.student_services
  SET weekday                   = p_weekday,
      start_time                = p_start_time,
      planned_duration_minutes  = p_duration_minutes,
      start_date                = p_effective_from,
      medium                    = COALESCE(p_medium, medium),
      finance_link              = COALESCE(p_finance_link, finance_link),
      submission_offset_minutes = COALESCE(p_submission_offset, submission_offset_minutes),
      updated_at                = NOW()
  WHERE id = p_service_id;

  -- Kesim: yürürlük tarihi ile ŞU AN'dan geç olanı.
  --
  -- Yürürlük geçmişe verilse bile geçmiş silinmez; `NOW()` tabanı
  -- "Durum güncellenmedi" satırlarını koruyan şeydir.
  v_cutoff := GREATEST(
    (p_effective_from::TIMESTAMP AT TIME ZONE 'Europe/Istanbul'),
    NOW()
  );

  WITH silinen AS (
    DELETE FROM public.service_sessions
    WHERE service_id = p_service_id
      AND status = 'planlandi'
      AND makeup_of_session_id IS NULL
      AND planned_at >= v_cutoff
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_removed FROM silinen;

  RETURN v_removed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_student_service(UUID, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_service(UUID, SMALLINT, TIME, SMALLINT, DATE, TEXT, TEXT, SMALLINT) TO authenticated;
