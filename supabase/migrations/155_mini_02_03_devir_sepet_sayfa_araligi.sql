-- ============================================================
-- 155 — Revize Mini 02 + Mini 03 (09.11.2026)
--
--   A) Mini 03 · set_section_page_range: kayıt varken de KONTROLLÜ düzeltme
--   B) Mini 02 · create_homework_batch: açık çalışmayı plan sepetinden devir
-- ============================================================


-- ------------------------------------------------------------
-- A) SAYFA ARALIĞI — kimlik koruyan düzeltme
--
-- 042'deki gövde iki kusurluydu:
--   1. Kullanılmış bölümü TAMAMEN reddediyordu; çok parçalı kitapta yanlış
--      içe aktarım ya da baskı farkı düzeltilemiyordu.
--   2. Kullanılmamış bölümde tüm sayfa birimlerini SİLİP yeniden
--      oluşturuyordu: birim kimlikleri değişiyor, kapsamı unit_ids ile
--      tanımlı hedefler (student_book_targets) sessizce kopuyordu. Ayrıca
--      yalnız 'active' tamamlamaya bakıyordu; geri alınmış tamamlama varken
--      DELETE yabancı anahtar hatasıyla patlıyordu.
--
-- Yeni gövde birimleri silip yeniden kurmaz:
--   resize  Sayfa numaraları aynı kalır. Eksik sayfalar eklenir; aralık
--           dışına çıkan KULLANILMAMIŞ sayfalar silinir. Kullanılmış sayfa
--           aralık dışında bırakılamaz (sayfalar adıyla söylenir).
--   shift   Baskı farkı: sayfa sayısı aynı, numaralar kayar. Birimler YERİNDE
--           yeniden numaralanır; ödev/tamamlama kayıtları kimliğe bağlı
--           olduğu için yeni numaralara taşınır, kopya oluşmaz.
--
-- "Kullanılmış": herhangi bir homework_items ya da HERHANGİ bir
-- test_completions kaydı (geri alınmış dahil — FK cascade değil).
-- Bölüm kaydı, part_id ve konu bağları DEĞİŞMEZ.
--
-- İmza değişti (p_mode); eski üç parametreli sürüm kaldırılır, yoksa
-- PostgREST çağrısı iki aday arasında belirsiz kalırdı.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_section_page_range(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.set_section_page_range(
  p_section_id UUID,
  p_page_start INTEGER,
  p_page_end   INTEGER,
  p_mode       TEXT DEFAULT 'resize'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_book_id      UUID;
  v_tracking     TEXT;
  v_old_start    INTEGER;
  v_old_end      INTEGER;
  v_offset       INTEGER;
  v_blocked      TEXT;
  v_added        INTEGER := 0;
  v_removed      INTEGER := 0;
  v_shifted      INTEGER := 0;
BEGIN
  SELECT bs.workspace_id, bs.book_id, b.tracking_mode, bs.page_start, bs.page_end
    INTO v_workspace_id, v_book_id, v_tracking, v_old_start, v_old_end
  FROM public.book_sections bs
  JOIN public.books b ON b.id = bs.book_id
  WHERE bs.id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_tracking <> 'page' THEN
    RAISE EXCEPTION 'Bu kitap sayfa ile takip edilmiyor';
  END IF;

  IF p_mode NOT IN ('resize', 'shift') THEN
    RAISE EXCEPTION 'Geçersiz düzeltme türü';
  END IF;

  IF p_page_start IS NULL OR p_page_end IS NULL OR p_page_start < 1 OR p_page_end < p_page_start THEN
    RAISE EXCEPTION 'Geçerli bir sayfa aralığı girin';
  END IF;

  IF (p_page_end - p_page_start + 1) > 1000 THEN
    RAISE EXCEPTION 'Bir bölüm en fazla 1000 sayfa olabilir';
  END IF;

  IF p_mode = 'shift' THEN
    IF v_old_start IS NULL OR v_old_end IS NULL
       OR (v_old_end - v_old_start) <> (p_page_end - p_page_start) THEN
      RAISE EXCEPTION 'Kaydırmada sayfa sayısı aynı kalmalı; sayfa sayısı değişiyorsa aralığı değiştirin';
    END IF;

    v_offset := p_page_start - v_old_start;

    IF v_offset <> 0 THEN
      -- İki adım: UNIQUE (section_id, order_index) ara durumda çakışmasın.
      UPDATE public.book_tests
         SET order_index = -order_index
       WHERE section_id = p_section_id;

      UPDATE public.book_tests
         SET order_index = -order_index + v_offset,
             page_start  = COALESCE(page_start, -order_index) + v_offset,
             page_end    = COALESCE(page_end, -order_index) + v_offset,
             title       = 'sf. ' || (-order_index + v_offset),
             updated_at  = NOW()
       WHERE section_id = p_section_id;
      GET DIAGNOSTICS v_shifted = ROW_COUNT;
    END IF;
  ELSE
    -- Aralık dışına çıkacak KULLANILMIŞ sayfa var mı?
    SELECT string_agg(bt.order_index::TEXT, ', ' ORDER BY bt.order_index)
      INTO v_blocked
    FROM public.book_tests bt
    WHERE bt.section_id = p_section_id
      AND (bt.order_index < p_page_start OR bt.order_index > p_page_end)
      AND (
        EXISTS (SELECT 1 FROM public.homework_items hi WHERE hi.book_test_id = bt.id)
        OR EXISTS (SELECT 1 FROM public.test_completions tc WHERE tc.book_test_id = bt.id)
      );

    IF v_blocked IS NOT NULL THEN
      RAISE EXCEPTION 'sf. % ödev/tamamlama kaydında kullanılmış; aralık dışında bırakılamaz. Baskı farkıysa sayfa numaralarını kaydırın', v_blocked;
    END IF;

    DELETE FROM public.book_tests bt
     WHERE bt.section_id = p_section_id
       AND (bt.order_index < p_page_start OR bt.order_index > p_page_end);
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    -- Aralıkta kalan ama pasifleşmiş birim yeniden etkin olur.
    UPDATE public.book_tests
       SET status = 'active', updated_at = NOW()
     WHERE section_id = p_section_id
       AND order_index BETWEEN p_page_start AND p_page_end
       AND status <> 'active';

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT v_workspace_id, v_book_id, p_section_id, 'sf. ' || n, n, n, n
    FROM generate_series(p_page_start, p_page_end) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM public.book_tests bt
      WHERE bt.section_id = p_section_id AND bt.order_index = n
    );
    GET DIAGNOSTICS v_added = ROW_COUNT;
  END IF;

  UPDATE public.book_sections
     SET page_start = p_page_start, page_end = p_page_end, updated_at = NOW()
   WHERE id = p_section_id;

  RETURN jsonb_build_object(
    'section_id', p_section_id,
    'page_count', p_page_end - p_page_start + 1,
    'added', v_added,
    'removed', v_removed,
    'shifted', v_shifted
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_section_page_range(UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_section_page_range(UUID, INTEGER, INTEGER, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- B) ÖDEV PARTİSİ — sepetten devir
--
-- Kitap Haritası'nda "Bu haftaya aktar" denen açık çalışma plan sepetine
-- düşer (veri değişmez). Plan yayınlanınca kalem `carry: true` ile gelir ve
-- AYNI işlemde:
--   1. yeni kalem carried_from_item_id = kaynak ile eklenir,
--   2. kaynak 'cancelled' + release_reason 'Devredildi' + carried_to olur,
--   3. açık kalemi kalmayan kaynak parti arşive iner.
-- 152'deki carry_homework_items ile aynı model; kaynak haftanın kapanış
-- fotoğrafı değişmez, uq_homework_items_carried_from ikinci devri engeller.
--
-- Kaynak bu arada teslim edildiyse (pending_approval) açık hata. Kaynak hiç
-- yoksa (tamamlandı/kaldırıldı) kalem normal yeni kalem olur. `carry`
-- olmayan kalemde 132'deki "zaten atanmış" kontrolü AYNEN durur.
-- İmza 132 ile aynı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_homework_batch(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_student_id        UUID,
  p_due_date          DATE,
  p_title             TEXT DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_items             JSONB DEFAULT '[]'::JSONB,
  p_due_at            TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id  UUID;
  v_batch_id    UUID;
  v_item        JSONB;
  v_sba_id      UUID;
  v_test_id     UUID;
  v_book_id     UUID;
  v_section_id  UUID;
  v_due_date    DATE;
  v_carry       BOOLEAN;
  v_source      public.homework_items%ROWTYPE;
  v_new_item    UUID;
  v_carried     INTEGER := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Student does not belong to this workspace';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Homework batch must have at least one item';
  END IF;

  v_due_date := COALESCE((p_due_at AT TIME ZONE 'Europe/Istanbul')::DATE, p_due_date);

  INSERT INTO public.homework_batches (
    workspace_id, academic_term_id, student_id, title, description,
    due_date, due_at, assigned_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_student_id, p_title, p_description,
    v_due_date, p_due_at, v_profile_id
  ) RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sba_id  := (v_item->>'student_book_assignment_id')::UUID;
    v_test_id := (v_item->>'book_test_id')::UUID;
    v_carry   := COALESCE((v_item->>'carry')::BOOLEAN, FALSE);
    v_source  := NULL;

    SELECT sba.book_id INTO v_book_id
    FROM public.student_book_assignments sba
    WHERE sba.id = v_sba_id AND sba.workspace_id = p_workspace_id;

    IF v_book_id IS NULL THEN
      RAISE EXCEPTION 'Invalid student_book_assignment_id: %', v_sba_id;
    END IF;

    SELECT section_id INTO v_section_id
    FROM public.book_tests
    WHERE id = v_test_id AND book_id = v_book_id AND status = 'active';

    IF v_section_id IS NULL THEN
      RAISE EXCEPTION 'book_test_id % does not belong to the assigned book', v_test_id;
    END IF;

    IF v_carry THEN
      -- Öğrenci teslim etti mi? O iş öğrencinin; devredilmez.
      IF EXISTS (
        SELECT 1
        FROM public.homework_items hi
        JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
        WHERE hb.student_id = p_student_id
          AND hi.book_test_id = v_test_id
          AND hi.status = 'pending_approval'
      ) THEN
        RAISE EXCEPTION 'Öğrenci bu çalışmayı teslim etti; devredilemez. Sepetten çıkarıp yeniden yayınlayın.';
      END IF;

      SELECT hi.* INTO v_source
      FROM public.homework_items hi
      JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
      WHERE hb.student_id = p_student_id
        AND hi.book_test_id = v_test_id
        AND hi.status = 'pending'
        AND hi.carried_to_item_id IS NULL
      ORDER BY hi.created_at DESC
      LIMIT 1;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.homework_items hi
        JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
        WHERE hb.student_id = p_student_id
          AND hi.book_test_id = v_test_id
          AND hi.status IN ('pending', 'pending_approval')
      ) THEN
        RAISE EXCEPTION 'Bu test öğrenciye zaten ödev olarak atanmış (bekleyen bir ödev kaydı var).';
      END IF;
    END IF;

    INSERT INTO public.homework_items (
      workspace_id, homework_batch_id, student_book_assignment_id,
      book_id, section_id, book_test_id, carried_from_item_id
    ) VALUES (
      p_workspace_id, v_batch_id, v_sba_id,
      v_book_id, v_section_id, v_test_id, v_source.id
    ) RETURNING id INTO v_new_item;

    IF v_source.id IS NOT NULL THEN
      UPDATE public.homework_items hi
         SET status = 'cancelled',
             released_at = NOW(),
             released_by_profile_id = v_profile_id,
             release_reason = 'Devredildi',
             carried_to_item_id = v_new_item,
             carried_at = NOW(),
             carry_requested_at = NULL,
             updated_at = NOW()
       WHERE hi.id = v_source.id;

      -- Açık kalemi kalmayan kaynak parti arşive iner (release ile aynı kural).
      UPDATE public.homework_batches hb
         SET status = 'archived', updated_at = NOW()
       WHERE hb.id = v_source.homework_batch_id
         AND hb.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.homework_items x
           WHERE x.homework_batch_id = hb.id
             AND x.status IN ('pending', 'pending_approval')
         );

      v_carried := v_carried + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('homework_batch_id', v_batch_id, 'carried', v_carried);
END;
$$;

REVOKE ALL ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_homework_batch(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ) TO authenticated;


-- ============================================================
-- ROLLBACK
--
--   -- create_homework_batch: 132_homework_due_at.sql tanımını yeniden çalıştırın.
--   DROP FUNCTION IF EXISTS public.set_section_page_range(UUID, INTEGER, INTEGER, TEXT);
--   -- set_section_page_range: 042_book_structure_r7.sql tanımını yeniden çalıştırın.
-- ============================================================
