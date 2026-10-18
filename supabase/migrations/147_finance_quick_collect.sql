-- ============================================================
-- 147 — FİNANS TEST 01-02 ARA REVİZYONU (17.10.2026)
--
-- 1) "Yapıldı + Tahsil Edildi" tek tık (TEST 01 · Ada, P0):
--    complete_session_and_collect üç kaydı TEK İŞLEMDE üretir —
--    gerçekleşme (set_session_outcome_v2), tahakkuk (oturum
--    tetikleyicisi trg_sync_session_accrual) ve tahsilat
--    (add_finance_payment_v2). Fiyat tanımsızsa hiçbiri kalmaz; koç
--    "Yalnız Yapıldı" ile devam eder ve fiyatı girer.
--    Tahsilat dersin ayına uygulanır (p_applies_to_month), yöntem nakit
--    (karar 19.10.2026); istisnalar Finans detayından düzeltilir.
--
-- 2) Otomatik tahakkuk Finans'tan bağımsız silinemez (P1): görüşmeden
--    doğan satır silinirse oturum "yapıldı" kalır ve bir sonraki
--    backfill satırı geri getirirdi (137'nin notu). Düzeltme kaynakta,
--    görüşmede yapılır. Manuel tahakkuk / gider / tahsilat silme aynen.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_session_and_collect(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_session public.service_sessions%ROWTYPE;
  v_participation TEXT;
  v_amount  INTEGER;
  v_date    DATE;
  v_today   DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
BEGIN
  SELECT * INTO v_session FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görüşme kaydı bulunamadı';
  END IF;

  -- Tahsilat yalnız sahibin işi (add_finance_payment_v2 ile aynı kural);
  -- erken kontrol, sonucun yarım yazılmasını değil hatanın netliğini sağlar.
  IF NOT public.has_workspace_role(v_session.workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  SELECT participation INTO v_participation
  FROM public.student_services WHERE id = v_session.service_id;
  IF v_participation = 'grup' OR v_session.group_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Grup oturumunda hızlı tahsilat yok; Finans detayından girin';
  END IF;

  IF v_session.status NOT IN ('planlandi', 'yapildi') THEN
    RAISE EXCEPTION 'Yalnız planlanan bir oturum Yapıldı işaretlenebilir';
  END IF;

  IF v_session.status = 'planlandi' THEN
    -- Planlanan tarih, süre ve hizmetin varsayılan birimi (normal senaryo).
    PERFORM public.set_session_outcome_v2(p_session_id, 'yapildi');
  END IF;

  SELECT (quantity * unit_price_kurus)::INTEGER, lesson_date
    INTO v_amount, v_date
  FROM public.finance_lessons
  WHERE service_session_id = p_session_id;

  IF v_amount IS NULL OR v_amount < 1 THEN
    RAISE EXCEPTION 'Bu tarihte geçerli fiyat yok; önce Hizmet Modeli''nden fiyat girin';
  END IF;

  PERFORM public.add_finance_payment_v2(
    v_session.student_id,
    LEAST(v_date, v_today),
    v_amount,
    'nakit',
    NULL,
    v_date,
    'Ders sonrası tahsilat'
  );

  RETURN v_amount;
END;
$fn$;

REVOKE ALL ON FUNCTION public.complete_session_and_collect(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_session_and_collect(UUID) TO authenticated;


-- 141 sürümü + görüşmeden doğan satır koruması.
CREATE OR REPLACE FUNCTION public.delete_finance_entry(
  p_kind TEXT,
  p_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_row_kind     TEXT;
  v_session_id   UUID;
BEGIN
  IF p_kind = 'lesson' THEN
    SELECT workspace_id, kind, service_session_id
      INTO v_workspace_id, v_row_kind, v_session_id
    FROM public.finance_lessons WHERE id = p_id;
  ELSIF p_kind = 'payment' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_payments WHERE id = p_id;
  ELSIF p_kind = 'expense' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_expenses WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Geçersiz kayıt türü';
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Kayıt bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_kind = 'lesson' AND v_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu kayıt bir görüşmeden otomatik oluştu; düzeltmek için görüşmeyi açın';
  END IF;

  IF p_kind = 'lesson' AND v_row_kind = 'aylik' THEN
    UPDATE public.finance_lessons
    SET unit_price_kurus = 0,
        note = 'Bu ay ücretlendirilmedi.'
    WHERE id = p_id;
  ELSIF p_kind = 'lesson' THEN
    DELETE FROM public.finance_lessons WHERE id = p_id;
  ELSIF p_kind = 'payment' THEN
    DELETE FROM public.finance_payments WHERE id = p_id;
  ELSE
    DELETE FROM public.finance_expenses WHERE id = p_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_finance_entry(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_finance_entry(TEXT, UUID) TO authenticated;

DO $dogrula$
BEGIN
  IF has_function_privilege('anon', 'public.complete_session_and_collect(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '147 DOĞRULAMA: complete_session_and_collect anon''a açık.';
  END IF;
END;
$dogrula$;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.complete_session_and_collect(UUID);
--   delete_finance_entry için 141_finance_v1.sql'deki sürümü yeniden çalıştırın.
