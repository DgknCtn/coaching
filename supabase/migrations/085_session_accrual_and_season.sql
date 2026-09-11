-- ============================================================
-- 085_session_accrual_and_season
--
-- R7 / Site Testi 04 Rev.3 · §8 ve §9:
--   "Gerçekleşen her ders finans tarafında tahakkuk üretir."
--   "Ders & Görüşmeler hizmet gerçeğini tutar. Finans tahakkuk/
--    tahsilatın ayrıntılı evidir. İki ekran AYNI gerçekleşmiş hizmet
--    kayıtlarına bağlı çalışır."
--   "Her öğrenci için eğitim dönemi sonunda sistem ... özeti otomatik
--    üretmelidir."
--
-- ============================================================
-- SORUN: İKİ DEFTER, TEK GERÇEK
-- ============================================================
-- 066 finansı kendi başına kurdu: öğretmen `finance_lessons`'a yapılan
-- dersi ELLE giriyordu. 074/075 ise aynı dersi zaten `service_sessions`
-- olarak tutuyor. Yani öğretmen aynı dersi iki kez kaydediyor ve iki
-- defter kaçınılmaz olarak ayrışıyordu: Görüşmeler'de "Eylül 4/5",
-- Finans'ta üç ders. Hangisinin doğru olduğunu söyleyecek bir şey yok.
--
-- Dokümanın sınır cümlesi açık: hizmet gerçeği TEK yerde, Ders &
-- Görüşmeler'de. Finans o gerçeğin para karşılığını tutar.
--
-- ============================================================
-- ÇÖZÜM: TETİKLEYİCİ, RPC DEĞİL
-- ============================================================
-- Tahakkuk `set_session_outcome`'a gömülmedi; `service_sessions`
-- üzerinde bir TETİKLEYİCİ olarak duruyor. Sebep: oturumun durumunu
-- değiştiren tek bir yol yok — 075'in tekil RPC'si, 083'ün grup
-- fan-out'u, 083'ün "katılmadı" istisnası ve 084'ün ileri tarihli
-- temizliği hepsi aynı tabloya yazıyor. Her birine ayrı ayrı tahakkuk
-- çağrısı eklemek, bir sonraki yazma yolunun onu unutmasını garanti
-- ederdi.
--
-- TAHAKKUK YALNIZ 'ders_basi' HİZMETTE DOĞAR (§8):
--   · ders_basi   → gerçekleşen her oturum bir tahakkuk satırı.
--   · aylik_paket → para aya bağlı, oturuma değil; satır üretilmez.
--   · haric       → finansal takip dışı.
--
-- SATIR GERİ ALINABİLİR: öğretmen "Yapıldı"yı geri alırsa ya da grup
-- oturumunda öğrenciyi "katılmadı" işaretlerse tahakkuk satırı SİLİNİR.
-- Sadece eklemek, geri alınan bir dersin borcunu kalıcı kılardı.
--
-- ELLE GİRİLEN SATIRLAR KORUNUR: yalnız `service_session_id` dolu
-- satırlar bu mekanizmanın malı. 066'dan beri elle girilmiş kayıtlara
-- dokunulmuyor.
--
-- SÜRE BİRİMİ 60 DAKİKA (§8: "Ders birimi 1 / 1,5 / 2 gibi değerleri
-- destekler"). `finance_lessons.quantity` tam sayı olduğu için 1,5 ders
-- oraya sığmıyor; birim fiyat süreyle ölçekleniyor. 90 dakikalık ders,
-- saatlik ücretin 1,5 katı tahakkuk eder ve satırda o tutar yazar —
-- 066'nın "ücret satıra kopyalanır" kuralıyla aynı mantık.
--
-- ÜCRET TANIMSIZSA TAHAKKUK YOK: `student_fees` satırı olmayan
-- öğrencide sıfır TL'lik satır açmak, "bu ders bedava yapıldı" demek
-- olurdu. Öğretmen ücreti girdiğinde geçmiş dersler için satır
-- açılmasını isterse Finans ekranından elle girer.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================


-- ============================================================
-- 1) TAHAKKUK SATIRININ KAYNAĞI
-- ============================================================
-- ON DELETE SET NULL: 084 ileri tarihli planlı oturumları siliyor.
-- Bunların tahakkuku zaten yok (gerçekleşmemişler), ama bir gün
-- gerçekleşmiş bir oturum silinirse para kaydının onunla birlikte yok
-- olması yanlış olur — satır kalır, yalnız bağı kopar.
ALTER TABLE public.finance_lessons
  ADD COLUMN IF NOT EXISTS service_session_id UUID
    REFERENCES public.service_sessions(id) ON DELETE SET NULL;

-- Bir oturum EN FAZLA bir tahakkuk satırı üretir. Tetikleyici birden
-- çok kez çalışsa bile (fan-out + tekil RPC arka arkaya) borç çoğalmaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_lessons_session
  ON public.finance_lessons (service_session_id)
  WHERE service_session_id IS NOT NULL;


-- ============================================================
-- 2) SENKRONİZASYON
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_session_accrual(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ss      public.service_sessions%ROWTYPE;
  v_service public.student_services%ROWTYPE;
  v_fee     INTEGER;
  v_minutes SMALLINT;
  v_amount  INTEGER;
  v_date    DATE;
  v_origin  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_ss FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  SELECT * INTO v_service FROM public.student_services WHERE id = v_ss.service_id;

  -- Tahakkuk doğurmayan HER durumda varsa satır silinir. Tek çıkış
  -- noktası olması, "geri alınan ders borçlu kaldı" hatasını yapısal
  -- olarak imkânsız kılıyor.
  IF v_service.finance_link IS DISTINCT FROM 'ders_basi'
     OR v_ss.status <> 'yapildi'
     OR v_ss.attended IS FALSE
  THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  SELECT per_lesson_kurus INTO v_fee
  FROM public.student_fees WHERE student_id = v_ss.student_id;

  IF v_fee IS NULL THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  v_minutes := COALESCE(v_ss.duration_minutes, v_service.planned_duration_minutes);
  v_amount  := ROUND(v_fee::NUMERIC * v_minutes / 60.0);

  -- TELAFİ ASIL AYA YAZILIR (082 ile aynı kural). Finans ayı ile
  -- Görüşmeler ayı ayrışırsa "Eylül 4 ders" ile "Eylül 12.000 TL"
  -- birbirini tutmaz ve hangisinin doğru olduğu sorulur.
  -- PARITY-BEGIN accrual_date
  SELECT asil.planned_at INTO v_origin
  FROM public.service_sessions asil
  WHERE asil.id = v_ss.makeup_of_session_id;

  v_date := (COALESCE(v_origin, v_ss.planned_at) AT TIME ZONE 'Europe/Istanbul')::DATE;
  -- PARITY-END accrual_date

  INSERT INTO public.finance_lessons (
    workspace_id, student_id, lesson_date, quantity, unit_price_kurus,
    service_session_id, note, created_by_profile_id
  )
  VALUES (
    v_ss.workspace_id, v_ss.student_id, v_date, 1, v_amount,
    p_session_id, 'Ders & Görüşmeler kaydından otomatik.', v_ss.created_by_profile_id
  )
  ON CONFLICT (service_session_id) WHERE service_session_id IS NOT NULL
  DO UPDATE SET
    lesson_date      = EXCLUDED.lesson_date,
    unit_price_kurus = EXCLUDED.unit_price_kurus;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_session_accrual(UUID) FROM PUBLIC;


CREATE OR REPLACE FUNCTION public.tg_sync_session_accrual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM public.sync_session_accrual(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_session_accrual ON public.service_sessions;
CREATE TRIGGER trg_sync_session_accrual
  AFTER INSERT OR DELETE OR
  UPDATE OF status, attended, duration_minutes, makeup_of_session_id
  ON public.service_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_session_accrual();


-- ============================================================
-- 3) ÖDEME DURUMU — öğrenci × ay
-- ============================================================
-- §7 no.4: öğretmen görünümünde "Tahsil edildi / Bekliyor".
--
-- AY BAZINDA, ÖĞRENCİ BAZINDA DEĞİL: 066'nın bakiyesi tüm zamanların
-- toplamı. Görüşmeler ekranı bir AY gösteriyor; "Eylül tahsil edildi mi"
-- sorusunun cevabı Ağustos'tan devreden borçla bulanmamalı.
--
-- TAHSİLAT AYA GÖRE EŞLEŞTİRİLİR (`paid_on`): ödemenin hangi derse ait
-- olduğu tutulmuyor ve uydurulmuyor. Bu bir muhasebe defteri değil,
-- öğretmenin "bu ay para geldi mi" sorusuna cevap.
CREATE OR REPLACE VIEW public.student_month_finance_view AS
WITH tahakkuk AS (
  SELECT
    student_id,
    workspace_id,
    date_trunc('month', lesson_date)::DATE AS ay,
    SUM(quantity * unit_price_kurus)::BIGINT AS accrued_kurus
  FROM public.finance_lessons
  GROUP BY student_id, workspace_id, date_trunc('month', lesson_date)
),
tahsilat AS (
  SELECT
    student_id,
    workspace_id,
    date_trunc('month', paid_on)::DATE AS ay,
    SUM(amount_kurus)::BIGINT AS collected_kurus
  FROM public.finance_payments
  GROUP BY student_id, workspace_id, date_trunc('month', paid_on)
)
SELECT
  COALESCE(t.student_id, p.student_id)     AS student_id,
  COALESCE(t.workspace_id, p.workspace_id) AS workspace_id,
  COALESCE(t.ay, p.ay)                     AS month_start,
  COALESCE(t.accrued_kurus, 0)             AS accrued_kurus,
  COALESCE(p.collected_kurus, 0)           AS collected_kurus,
  COALESCE(t.accrued_kurus, 0) - COALESCE(p.collected_kurus, 0) AS balance_kurus
FROM tahakkuk t
FULL OUTER JOIN tahsilat p
  ON p.student_id = t.student_id AND p.ay = t.ay;

ALTER VIEW public.student_month_finance_view SET (security_invoker = on);
REVOKE ALL ON public.student_month_finance_view FROM anon;
GRANT SELECT ON public.student_month_finance_view TO authenticated;


-- ============================================================
-- 4) SEZON ÖZETİ (§9)
-- ============================================================
-- Doküman göstergeleri: birebir ders, grup dersi ve koçluk için ayrı
-- oturum sayısı ve süre; toplam temas, toplam süre, toplam tahakkuk,
-- tahsil edilen ve kalan.
--
-- PENCERE AKTİF EĞİTİM DÖNEMİ: "sezon" bu üründe `academic_terms`.
-- Tarihleri tanımlanmamışsa tüm zamanlar alınır — boş bir özet
-- göstermektense eksiksiz olanı göstermek doğru; ekran hangi pencerede
-- olduğunu zaten yazıyor.
--
-- SÜRE GERÇEKLEŞENDEN OKUNUR: `duration_minutes` yoksa hizmetin
-- planlanan süresi. Yapılmamış oturum hiç sayılmaz — sezon özeti
-- "ne verildi"nin kaydı, "ne planlandı"nın değil.
--
-- FİNANS SÜTUNLARI RLS'E TABİ: `security_invoker` sayesinde finans
-- tablolarını göremeyen bir öğretmen için tahakkuk/tahsilat NULL gelir,
-- oturum sayıları görünmeye devam eder. 066'nın "finans yalnız owner"
-- kuralı burada da geçerli; özet onu delmiyor.
--
-- ============================================================
-- 075'İN NOTU AŞILDI
-- ============================================================
-- 075 bu view'ı (öğrenci × tür × katılım) uzun biçimde kurmuş ve
-- parasal toplamları bilinçli olarak dışarıda bırakmıştı: "iki yerde
-- toplanan bir para, er geç iki farklı sayı demektir."
--
-- Gerekçe doğru, sonucu eksikti. Doküman §9'un özet tablosu oturum
-- sayısı ile tahakkuk/tahsilatı YAN YANA istiyor; ikisi ayrı iki
-- sorgudan gelirse birleştirme işi ekrana kalır ve asıl korkulan şey
-- orada olur. Burada para YENİDEN TOPLANMIYOR — 066'nın
-- `student_finance_view`'ı olduğu gibi bağlanıyor. Tek kaynak kuralı
-- korunuyor, yalnız okuma tek satıra iniyor.
--
-- Sütun listesi değiştiği için CREATE OR REPLACE yetmez; view önce
-- düşürülüyor.
DROP VIEW IF EXISTS public.student_season_summary_view;

CREATE OR REPLACE VIEW public.student_season_summary_view AS
WITH donem AS (
  SELECT DISTINCT ON (workspace_id)
    workspace_id, start_date, end_date
  FROM public.academic_terms
  WHERE status = 'active'
  ORDER BY workspace_id, start_date DESC NULLS LAST
),
oturum AS (
  SELECT
    ss.student_id,
    sv.kind,
    sv.participation,
    COALESCE(ss.duration_minutes, sv.planned_duration_minutes) AS dakika
  FROM public.service_sessions ss
  JOIN public.student_services sv ON sv.id = ss.service_id
  LEFT JOIN donem d ON d.workspace_id = ss.workspace_id
  WHERE ss.status = 'yapildi'
    AND ss.attended IS DISTINCT FROM FALSE
    AND (d.start_date IS NULL
         OR (ss.planned_at AT TIME ZONE 'Europe/Istanbul')::DATE >= d.start_date)
    AND (d.end_date IS NULL
         OR (ss.planned_at AT TIME ZONE 'Europe/Istanbul')::DATE <= d.end_date)
)
SELECT
  s.id           AS student_id,
  s.workspace_id,
  s.full_name    AS student_full_name,

  COUNT(*) FILTER (WHERE o.kind = 'ders' AND o.participation = 'birebir')::INTEGER
    AS birebir_ders_count,
  COALESCE(SUM(o.dakika) FILTER (WHERE o.kind = 'ders' AND o.participation = 'birebir'), 0)::INTEGER
    AS birebir_ders_minutes,

  COUNT(*) FILTER (WHERE o.kind = 'ders' AND o.participation = 'grup')::INTEGER
    AS grup_ders_count,
  COALESCE(SUM(o.dakika) FILTER (WHERE o.kind = 'ders' AND o.participation = 'grup'), 0)::INTEGER
    AS grup_ders_minutes,

  COUNT(*) FILTER (WHERE o.kind = 'kocluk')::INTEGER
    AS kocluk_count,
  COALESCE(SUM(o.dakika) FILTER (WHERE o.kind = 'kocluk'), 0)::INTEGER
    AS kocluk_minutes,

  COUNT(o.student_id)::INTEGER        AS total_count,
  COALESCE(SUM(o.dakika), 0)::INTEGER AS total_minutes,

  f.accrued_kurus,
  f.collected_kurus,
  f.balance_kurus
FROM public.students s
LEFT JOIN oturum o ON o.student_id = s.id
LEFT JOIN public.student_finance_view f ON f.student_id = s.id
GROUP BY s.id, s.workspace_id, s.full_name,
         f.accrued_kurus, f.collected_kurus, f.balance_kurus;

ALTER VIEW public.student_season_summary_view SET (security_invoker = on);
REVOKE ALL ON public.student_season_summary_view FROM anon;
GRANT SELECT ON public.student_season_summary_view TO authenticated;


-- ============================================================
-- 5) VAR OLAN KAYITLARIN BİR KEZ EŞİTLENMESİ
-- ============================================================
-- 085 öncesinde gerçekleşmiş oturumların tahakkuku yok. Tetikleyici
-- yalnız BUNDAN SONRAKİ yazmalarda çalışır; geçmiş sessizce eksik
-- kalırdı. Yeniden çalıştırıldığında UNIQUE indeks sayesinde satır
-- çoğalmaz.
DO $backfill$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ss.id
    FROM public.service_sessions ss
    JOIN public.student_services sv ON sv.id = ss.service_id
    WHERE ss.status = 'yapildi'
      AND sv.finance_link = 'ders_basi'
  LOOP
    PERFORM public.sync_session_accrual(r.id);
  END LOOP;
END;
$backfill$;
