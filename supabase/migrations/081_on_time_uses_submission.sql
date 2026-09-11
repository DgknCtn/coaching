-- ============================================================
-- 081_on_time_uses_submission
--
-- SORUN: "ZAMANINDA TESLİM" ÖĞRETMENİN ONAY SAATİNİ ÖLÇÜYORDU
--
-- 077'nin `close_weekly_flow` fonksiyonu zamanında teslimi
-- `test_completions.completed_at` üzerinden sayıyor ve yorumunda bunu
-- *"öğrencinin teslim ettiği an"* diye tarif ediyor. BU TARİF YANLIŞ.
--
-- 014'e bakıldığında `test_completions` satırı YALNIZCA
-- `approve_homework_item` içinde, yani ÖĞRETMEN ONAYLADIĞINDA açılıyor:
--
--   UPDATE homework_items SET status = 'completed', ...
--   INSERT INTO test_completions (... completed_at ...) VALUES (... NOW() ...)
--
-- Öğrencinin gönderim anı ise başka bir sütunda:
--
--   submit_homework_item:  SET status = 'pending_approval', submitted_at = NOW()
--
-- ============================================================
-- SONUÇ: ÖĞRENCİ, ÖĞRETMENİN GECİKMESİNDEN CEZA ALIYORDU
-- ============================================================
-- Cumartesi gece yarısından önce her şeyi gönderen bir öğrenci,
-- öğretmen Pazartesi onayladığında "geç teslim" olarak kaydediliyordu.
-- Bu fotoğraf KALICI (kabul #9: bir daha değişmez), yani hata sonradan
-- düzeltilemiyordu bile.
--
-- R7/05 kabul #8 ve §6 bunu açıkça yasaklıyor:
--   "Öğrenci 'onaya gönderdi' ise teslim sayılır."
--   "Öğretmen onayı öğrencinin ilerlemesini geriye düşürmez."
--
-- ============================================================
-- ÇÖZÜM: ÖLÇÜT homework_items.submitted_at
-- ============================================================
-- Onay bu sütunu KORUYOR (014: approve yalnız status/approved_at/
-- completed_at yazıyor), bu yüzden onaylanmış bir iş de doğru anıyla
-- sayılır.
--
-- İade edilen iş `submitted_at = NULL` oluyor (014: reject) ve böylece
-- teslim sayılmıyor — belgenin kuralı: *"İade edilen çalışma yeniden
-- gönderilene kadar teslim sayılmaz."* Yeniden gönderildiğinde sütun
-- yeni anla dolar.
--
-- NEDEN COALESCE(submitted_at, completed_at) DEĞİL: onay anına düşen her
-- yedek, düzeltmeye çalıştığımız hatayı sessizce geri getirirdi.
--
-- 080'deki `student_active_flow_load_view` zaten DOĞRU ölçüyor
-- (`hi.status IN ('pending_approval','completed')`), yani Dashboard ile
-- Haftalık Akış bu düzeltmeden önce farklı sayılar gösteriyordu.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_weekly_flow(
  p_flow_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_flow      public.weekly_flows%ROWTYPE;
  v_total     INTEGER;
  v_on_time   INTEGER;
BEGIN
  SELECT * INTO v_flow FROM public.weekly_flows WHERE id = p_flow_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haftalık akış bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_flow.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_flow.status = 'closed' THEN
    -- Yeniden kapatmak fotoğrafı BOZARDI: ikinci çağrı, aradan geçen
    -- sürede gelen geç teslimleri "zamanında" sayardı.
    RETURN;
  END IF;

  -- PARITY-BEGIN on_time_source
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE hi.submitted_at IS NOT NULL AND hi.submitted_at <= v_flow.due_at
    )
  INTO v_total, v_on_time
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hb.weekly_flow_id = p_flow_id
    AND hi.status <> 'cancelled';
  -- PARITY-END on_time_source

  UPDATE public.weekly_flows
  SET status            = 'closed',
      closed_at         = NOW(),
      on_time_delivered = v_on_time,
      on_time_total     = v_total,
      updated_at        = NOW()
  WHERE id = p_flow_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.close_weekly_flow(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_weekly_flow(UUID) TO authenticated;
