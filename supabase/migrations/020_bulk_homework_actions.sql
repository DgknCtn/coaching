-- ============================================================
-- 020_bulk_homework_actions
-- R3 v2 §3 (yüksek hacimli öğrenci senaryosu): haftada 100-120 test verilen
-- öğrencide mevcut kalem-kalem akış pratik değil — öğrencinin 100 kez
-- "onaya gönder", öğretmenin 100 kez "onayla" tıklaması beklenemez.
--
-- KRİTİK KURAL: Toplu işlem yalnız arayüz kolaylığıdır. Alttaki kayıtlar tek
-- tek korunur — her homework_items satırı ve her test_completions satırı
-- aynen oluşur, sadece tek transaction'da. Böylece test bazlı geçmiş ve
-- raporlama bozulmaz.
--
-- İzin kontrolleri ve dedup davranışı 014'teki tekil RPC'lerle birebir aynı.
-- Kapsam batch, isteğe bağlı olarak kitap grubuyla daraltılır (p_book_id).
-- ============================================================

-- ============================================================
-- 1) submit_homework_items_bulk
-- Öğrenci (veya öğretmen adına): batch/kitap grubundaki tüm 'pending'
-- kalemleri 'pending_approval'a taşır. test_completions'a YAZMAZ —
-- onay bekleyen bir ödev ilerlemeye sayılmaz (014 ile aynı semantik).
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_homework_items_bulk(
  p_homework_batch_id UUID,
  p_book_id           UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_batch       public.homework_batches%ROWTYPE;
  v_count       INT;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_homework_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev grubu bulunamadı'; END IF;

  IF NOT (
    public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending_approval',
      submitted_at = NOW(),
      submitted_by_profile_id = v_profile_id,
      rejected_at = NULL,
      teacher_note = NULL
  WHERE hi.homework_batch_id = p_homework_batch_id
    AND hi.status = 'pending'
    AND (p_book_id IS NULL OR hi.book_id = p_book_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'homework_batch_id', p_homework_batch_id,
    'book_id', p_book_id,
    'submitted_count', v_count
  );
END;
$$;

-- ============================================================
-- 2) approve_homework_items_bulk
-- Yalnız öğretmen/owner: batch/kitap grubundaki tüm 'pending_approval'
-- kalemleri onaylar ve her biri için ayrı bir test_completions satırı yazar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_homework_items_bulk(
  p_homework_batch_id UUID,
  p_book_id           UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id  UUID;
  v_batch       public.homework_batches%ROWTYPE;
  v_count       INT;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_homework_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ödev grubu bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- UPDATE ... RETURNING ile onaylanan kümeyi doğrudan INSERT'e besliyoruz.
  -- Tek ifade olduğu için ara tablo/temp table gerekmez ve iki yazma da
  -- kesin olarak aynı satır kümesini görür.
  WITH upd AS (
    UPDATE public.homework_items hi
    SET status = 'completed',
        approved_at = NOW(),
        approved_by_profile_id = v_profile_id,
        completed_at = NOW(),
        completed_by_profile_id = v_profile_id
    WHERE hi.homework_batch_id = p_homework_batch_id
      AND hi.status = 'pending_approval'
      AND (p_book_id IS NULL OR hi.book_id = p_book_id)
    RETURNING hi.id, hi.workspace_id, hi.student_book_assignment_id, hi.book_test_id
  ),
  -- Her onaylanan kalem için ayrı bir ilerleme kaydı. Tekil
  -- approve_homework_item ile aynı alanlar ve aynı dedup davranışı;
  -- uniq_active_test_completion kısmi indeksi çakışmayı emer.
  ins AS (
    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id,
      source, source_homework_item_id, status
    )
    SELECT
      u.workspace_id,
      v_batch.academic_term_id,
      v_batch.student_id,
      u.student_book_assignment_id,
      u.book_test_id,
      NOW(),
      v_profile_id,
      'homework',
      u.id,
      'active'
    FROM upd u
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;

  RETURN jsonb_build_object(
    'homework_batch_id', p_homework_batch_id,
    'book_id', p_book_id,
    'approved_count', v_count
  );
END;
$$;
