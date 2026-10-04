-- ============================================================
-- 137 — FİNANS TEMİZLİĞİ
--
-- Tek tek ders/tahsilat silme 066'dan beri vardı (delete_finance_entry).
-- Eksik olanlar:
--
--   delete_student_fee      — öğrencinin ders ücreti tanımını kaldırır.
--                             Geçmiş tahakkuklar KALIR (her satır kendi
--                             birim fiyatını taşıyor, 066). Yalnız yeni
--                             ders eklenemez / otomatik tahakkuk durur.
--   delete_payment_notice   — velinin "ödeme yaptım" bildirimini siler
--                             (bekleyen, onaylanmış ya da reddedilmiş).
--                             Onaylanan bildirimin deftere yazılmış
--                             tahsilatı AYRI bir kayıttır, silinmez.
--   purge_student_finance   — bir öğrencinin TÜM finans kayıtlarını
--                             (dersler, tahsilatlar, bildirimler, ücret)
--                             siler; öğrenci kalır. Öğrencinin adı birebir
--                             yazılarak onaylanır. Test kayıtları için.
--
-- YETKİ: hepsi yalnız çalışma alanı SAHİBİ (066'daki finans kuralı).
--
-- OTOMATİK TAHAKKUK UYARISI: Görüşmeler'den gelen ders satırı
-- (finance_lessons.service_session_id dolu) silinse de oturum yeniden
-- kaydedilirse tetikleyici (085) onu yeniden yazar. Ücret tanımı da
-- silinmişse yazmaz. Arayüz bu satırları "otomatik" diye işaretler.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Silinen kayıt geri gelmez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_student_fee(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  DELETE FROM public.student_fees
   WHERE student_id = p_student_id AND workspace_id = v_workspace_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_payment_notice(p_notice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.parent_payment_notices WHERE id = p_notice_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Bildirim bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  DELETE FROM public.parent_payment_notices WHERE id = p_notice_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.purge_student_finance(
  p_student_id   UUID,
  p_confirm_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_student  RECORD;
  v_lessons  INT;
  v_payments INT;
  v_notices  INT;
  v_fee      INT;
BEGIN
  SELECT id, workspace_id, full_name INTO v_student
  FROM public.students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_student.workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;
  IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_student.full_name) THEN
    RAISE EXCEPTION 'Onay için öğrencinin adını birebir yazın.';
  END IF;

  -- Ücret ÖNCE: yoksa aşağıdaki silmeler sırasında tetiklenen bir oturum
  -- senkronu (085) tahakkuku yeniden yazamaz.
  DELETE FROM public.student_fees WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_fee = ROW_COUNT;
  DELETE FROM public.finance_lessons WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_lessons = ROW_COUNT;
  DELETE FROM public.finance_payments WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_payments = ROW_COUNT;
  DELETE FROM public.parent_payment_notices WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_notices = ROW_COUNT;

  PERFORM public.log_audit_event(
    v_student.workspace_id,
    'finance.purge_student',
    'student',
    v_student.id,
    jsonb_build_object('lessons', v_lessons, 'payments', v_payments,
                       'notices', v_notices, 'fee', v_fee)
  );

  RETURN jsonb_build_object('lessons', v_lessons, 'payments', v_payments,
                            'notices', v_notices, 'fee', v_fee);
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_student_fee(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_student_fee(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_payment_notice(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_payment_notice(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.purge_student_finance(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purge_student_finance(UUID, TEXT) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.purge_student_finance(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.delete_payment_notice(UUID);
--   DROP FUNCTION IF EXISTS public.delete_student_fee(UUID);
-- ============================================================
