-- ============================================================
-- 032_approve_selected_items  (R6-08)
--
-- Görevler ekranında grup butonuna basıldığında 11/35 gibi TÜM çalışmalar
-- içerik görülmeden doğrudan onaylanabiliyordu. R6-08 araya bir drawer
-- koyuyor: eğitmen listeyi görüyor, bazılarını çıkarabiliyor, sonra
-- onaylıyor.
--
-- Bu, mevcut approve_homework_items_bulk'un (020) yerini ALMAZ; onun
-- yanına serbest seçim varyantı ekler. 020 batch+kitap bazlıdır ve
-- "hepsini onayla" anlamına gelir; bu ise "şunları onayla" der.
--
-- 020'nin gövdesindeki tek ifadeli UPDATE ... RETURNING -> INSERT deseni
-- korunur: iki yazma da kesin olarak aynı satır kümesini görür ve
-- uniq_active_test_completion kısmi indeksi duplicate'i emer.
--
-- KISMİ BAŞARI: fonksiyon kaç kalemin gerçekten onaylandığını döndürür.
-- İstemci "33 çalışma onaylandı" diyebilsin diye; sessizce "tamam" demek
-- yerine gerçek sayı raporlanır.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_selected_homework_items(
  p_homework_item_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_approved   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF p_homework_item_ids IS NULL OR array_length(p_homework_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('approved', 0);
  END IF;

  -- Yetki kalem kalem kontrol edilir: istemci farklı workspace'lerden id
  -- karıştırmış olabilir. Yetkisi olmayan kalem sessizce dışarıda kalmaz —
  -- hata verilir, çünkü bu normal kullanımda oluşmayacak bir durumdur.
  IF EXISTS (
    SELECT 1
    FROM public.homework_items hi
    WHERE hi.id = ANY(p_homework_item_ids)
      AND NOT public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH upd AS (
    UPDATE public.homework_items hi
    SET status = 'completed',
        approved_at = NOW(),
        approved_by_profile_id = v_profile_id,
        completed_at = NOW(),
        completed_by_profile_id = v_profile_id
    WHERE hi.id = ANY(p_homework_item_ids)
      AND hi.status = 'pending_approval'
    RETURNING hi.id, hi.workspace_id, hi.homework_batch_id,
              hi.student_book_assignment_id, hi.book_test_id
  ),
  ins AS (
    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id,
      source, source_homework_item_id, status
    )
    SELECT
      u.workspace_id,
      hb.academic_term_id,
      hb.student_id,
      u.student_book_assignment_id,
      u.book_test_id,
      NOW(),
      v_profile_id,
      'homework',
      u.id,
      'active'
    FROM upd u
    JOIN public.homework_batches hb ON hb.id = u.homework_batch_id
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_approved FROM upd;

  RETURN jsonb_build_object('approved', v_approved);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.approve_selected_homework_items(UUID[]);
--
-- 020'deki approve_homework_items_bulk'a dokunulmadı; bu migration yalnız
-- yeni bir fonksiyon ekler.
-- ============================================================
