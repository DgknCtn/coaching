-- ============================================================
-- 082_session_month_attribution
--
-- R7 / Site Testi 04 Rev.3 · §7-C ve kabul maddesi:
--   "Sonraki ay yapılan telafi asıl ayın hizmet borcunu kapatıyor;
--    yeni aya ekstra hizmet yazmıyor."
--
-- ============================================================
-- SORUN 1: EKRAN DOĞRU VIEW'I HİÇ SORGULAMIYORDU
-- ============================================================
-- 075 bu kuralı `student_service_month_view` içinde DOĞRU kurmuş:
-- satırın ayı, telafi ise bağlı olduğu asıl oturumun ayıdır
-- (`COALESCE(asil.planned_at, ss.planned_at)`).
--
-- Ama Ders & Görüşmeler ekranı o view'ı hiç okumuyor; ham
-- `service_sessions` tablosunu `planned_at` aralığıyla çekip sayıları
-- JavaScript'te yeniden hesaplıyor. Sonuç, şemanın garanti ettiğinin
-- tam tersi:
--
--   Eylül'de yapılmayan ders için Ekim'e telafi girilir →
--   telafi EKİM listesinde ve EKİM sayaçlarında görünür,
--   Eylül ise "3/4" olarak eksik kalır.
--
-- Yani kural veritabanında doğru, ekranda yanlıştı.
--
-- ÇÖZÜM: listenin de aynı atfı kullanabilmesi için satır düzeyinde bir
-- view. Sayaçlar için `student_service_month_view` zaten var; burada
-- eksik olan, LİSTEYİ aynı kuralla süzebilmek. Ekranın kendi tarih
-- aralığını kurması bu yüzden bırakılıyor — her ekran kendi ayını
-- hesaplarsa kural yine ayrışır.
--
-- ============================================================
-- SORUN 2: "TELAFİ BEKLİYOR" İLE "TELAFİ EDİLMEYECEK" AYNI ŞEYDİ
-- ============================================================
-- §7-C dört sonuç tanımlıyor ve ikisi aynı `yapilmadi` durumuna
-- düşüyordu:
--
--   Telafi edilecek     → "Yapılmadı · Telafi bekliyor"  → ay TAMAMLANMAMIŞ
--   Telafi edilmeyecek  → "Yapılmadı"                    → ay 3/4 kalır
--
-- Ayrım öğretmenin KARARIDIR ve veriden türetilemez: telafi kaydı
-- henüz açılmamışken "bekliyor mu, vazgeçildi mi" sorusunun cevabı
-- yalnız öğretmende. Bu yüzden yeni bir sütun.
--
-- NULL = karar verilmedi. Üç durumlu bir alan yerine iki değer + NULL
-- seçildi: "henüz karar yok" gerçek bir durum ve onu 'pending' ile
-- karıştırmak, öğretmenin vermediği bir sözü kaydetmek olurdu.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================

-- ============================================================
-- 1) Telafi kararı
-- ============================================================
ALTER TABLE public.service_sessions
  ADD COLUMN IF NOT EXISTS makeup_decision TEXT;

ALTER TABLE public.service_sessions
  DROP CONSTRAINT IF EXISTS service_sessions_makeup_decision_chk;

ALTER TABLE public.service_sessions
  ADD CONSTRAINT service_sessions_makeup_decision_chk
  CHECK (makeup_decision IS NULL OR makeup_decision IN ('pending', 'waived'));

-- ============================================================
-- 2) set_makeup_decision — "telafi edilecek" / "edilmeyecek"
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_makeup_decision(
  p_session_id UUID,
  p_decision   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.service_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_row.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Karar yalnız GERÇEKLEŞMEMİŞ bir hizmet için anlamlı. Yapılmış ya da
  -- önceden iptal edilmiş bir oturuma telafi kararı yazmak, olmayan bir
  -- borcu kaydetmek olurdu.
  IF v_row.status <> 'yapilmadi' THEN
    RAISE EXCEPTION 'Telafi kararı yalnız "Yapılmadı" işaretli görüşme için verilir';
  END IF;

  IF p_decision IS NOT NULL AND p_decision NOT IN ('pending', 'waived') THEN
    RAISE EXCEPTION 'Geçersiz telafi kararı';
  END IF;

  UPDATE public.service_sessions
  SET makeup_decision = p_decision,
      updated_at      = NOW()
  WHERE id = p_session_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_makeup_decision(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_makeup_decision(UUID, TEXT) TO authenticated;

-- ============================================================
-- 3) student_service_session_view — satır düzeyinde ay atfı
-- ============================================================
--
-- `student_service_month_view` ile AYNI kuralı kullanır; ikisi
-- ayrışırsa aynı ekranda sayaç bir ay, liste başka bir ay gösterir.
-- Bu yüzden ay ifadesi kelimesi kelimesine aynıdır.

DROP VIEW IF EXISTS public.student_service_session_view CASCADE;

CREATE VIEW public.student_service_session_view
WITH (security_invoker = true) AS
SELECT
  ss.id,
  ss.workspace_id,
  ss.student_id,
  ss.service_id,
  ss.group_session_id,
  ss.planned_at,
  ss.actual_at,
  ss.duration_minutes,
  ss.status,
  ss.attended,
  ss.note,
  ss.makeup_of_session_id,
  ss.makeup_decision,
  -- Telafinin bağlı olduğu asıl oturumun planlanan anı; arayüz
  -- "hangi ayın telafisi" diye yazabilsin diye taşınıyor.
  asil.planned_at AS origin_planned_at,
  -- PARITY-BEGIN attributed_month
  date_trunc(
    'month',
    COALESCE(asil.planned_at, ss.planned_at) AT TIME ZONE 'Europe/Istanbul'
  )::DATE AS attributed_month
  -- PARITY-END attributed_month
FROM public.service_sessions ss
LEFT JOIN public.service_sessions asil
  ON asil.id = ss.makeup_of_session_id;

REVOKE ALL ON public.student_service_session_view FROM anon;
GRANT SELECT ON public.student_service_session_view TO authenticated;
