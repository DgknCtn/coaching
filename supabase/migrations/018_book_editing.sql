-- ============================================================
-- 018_book_editing
-- Kitap havuzundaki bir kitap oluşturulduktan sonra düzenlenemiyordu:
-- yalnızca sayfa aralığı güncellenebiliyor ve kitap arşivlenebiliyordu.
-- Bir yazım hatası ya da eksik bırakılmış test sayısı, kitabı silip
-- yeniden kurmayı gerektiriyordu.
--
-- Bu migration kitap bilgileri + bölüm/test yapısı için RPC'ler ekliyor.
-- Hepsi 005/013/014'teki desenle aynı: SECURITY DEFINER + owner/teacher
-- rol kontrolü, Türkçe hata mesajları.
--
-- Bilinçli olarak DIŞARIDA bırakılan: tracking_mode (test/sayfa) değişimi.
-- 013'te bu seçim kitabın tüm ilerleme hesabını belirliyor; sonradan
-- çevirmek mevcut test_completions kayıtlarını anlamsızlaştırır.
-- ============================================================

-- ============================================================
-- 1) update_book_metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_book_metadata(
  p_book_id     UUID,
  p_title       TEXT,
  p_subject     TEXT,
  p_publisher   TEXT DEFAULT NULL,
  p_exam_type   TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Kitap adı boş olamaz';
  END IF;

  UPDATE public.books
  SET title = p_title, subject = p_subject, publisher = p_publisher,
      exam_type = p_exam_type, description = p_description, updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id, 'updated', true);
END;
$$;

-- ============================================================
-- 2) rename_book_section
-- ============================================================
CREATE OR REPLACE FUNCTION public.rename_book_section(
  p_section_id UUID,
  p_title      TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.book_sections WHERE id = p_section_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Bölüm adı boş olamaz';
  END IF;

  UPDATE public.book_sections
  SET title = p_title, updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id, 'renamed', true);
END;
$$;

-- ============================================================
-- 3) add_book_section
-- Test başlıkları create_book_with_sections_and_tests'teki (013)
-- numaralandırmanın aynısı: takip türüne göre "N. Test" / "N. Sayfa Aralığı".
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_book_section(
  p_book_id    UUID,
  p_title      TEXT,
  p_test_count INT DEFAULT 1
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id  UUID;
  v_tracking_mode TEXT;
  v_order         INT;
  v_section_id    UUID;
BEGIN
  SELECT workspace_id, tracking_mode INTO v_workspace_id, v_tracking_mode
  FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Bölüm adı boş olamaz';
  END IF;

  IF p_test_count < 1 OR p_test_count > 200 THEN
    RAISE EXCEPTION 'Test sayısı 1 ile 200 arasında olmalı';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_sections WHERE book_id = p_book_id;

  INSERT INTO public.book_sections (workspace_id, book_id, title, order_index)
  VALUES (v_workspace_id, p_book_id, p_title, v_order)
  RETURNING id INTO v_section_id;

  FOR i IN 1..p_test_count LOOP
    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
    VALUES (
      v_workspace_id, p_book_id, v_section_id,
      CASE WHEN v_tracking_mode = 'page' THEN i || '. Sayfa Aralığı' ELSE i || '. Test' END,
      i
    );
  END LOOP;

  RETURN jsonb_build_object('section_id', v_section_id, 'test_count', p_test_count);
END;
$$;

-- ============================================================
-- 4) set_section_test_count
-- Artırma: sondan yeni testler ekler.
-- Azaltma: YALNIZCA hiçbir ödevde (homework_items) ve hiçbir tamamlama
-- kaydında (test_completions, reverted olanlar dahil) kullanılmamış
-- sondaki testleri siler. Kullanılmış bir teste denk gelirse hiçbir şey
-- silinmez ve anlamlı bir hata döner — geçmiş ilerleme sessizce yok
-- edilmemeli.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_section_test_count(
  p_section_id UUID,
  p_test_count INT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id  UUID;
  v_book_id       UUID;
  v_tracking_mode TEXT;
  v_current       INT;
  v_blocked       RECORD;
BEGIN
  SELECT bs.workspace_id, bs.book_id, b.tracking_mode
    INTO v_workspace_id, v_book_id, v_tracking_mode
  FROM public.book_sections bs
  JOIN public.books b ON b.id = bs.book_id
  WHERE bs.id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_test_count < 1 OR p_test_count > 200 THEN
    RAISE EXCEPTION 'Test sayısı 1 ile 200 arasında olmalı';
  END IF;

  SELECT COUNT(*) INTO v_current FROM public.book_tests WHERE section_id = p_section_id;

  IF p_test_count = v_current THEN
    RETURN jsonb_build_object('section_id', p_section_id, 'test_count', v_current, 'unchanged', true);
  END IF;

  IF p_test_count > v_current THEN
    FOR i IN (v_current + 1)..p_test_count LOOP
      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
      VALUES (
        v_workspace_id, v_book_id, p_section_id,
        CASE WHEN v_tracking_mode = 'page' THEN i || '. Sayfa Aralığı' ELSE i || '. Test' END,
        i
      );
    END LOOP;

    RETURN jsonb_build_object('section_id', p_section_id, 'test_count', p_test_count, 'added', p_test_count - v_current);
  END IF;

  -- Azaltma: silinecek aralıkta kullanılmış test var mı?
  SELECT bt.title INTO v_blocked
  FROM public.book_tests bt
  WHERE bt.section_id = p_section_id
    AND bt.order_index > p_test_count
    AND (
      EXISTS (SELECT 1 FROM public.homework_items hi WHERE hi.book_test_id = bt.id)
      OR EXISTS (SELECT 1 FROM public.test_completions tc WHERE tc.book_test_id = bt.id)
    )
  ORDER BY bt.order_index
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Bu bölümdeki "%" bir ödevde veya tamamlama kaydında kullanılmış, silinemez.', v_blocked.title;
  END IF;

  DELETE FROM public.book_tests
  WHERE section_id = p_section_id AND order_index > p_test_count;

  RETURN jsonb_build_object('section_id', p_section_id, 'test_count', p_test_count, 'removed', v_current - p_test_count);
END;
$$;

-- ============================================================
-- 5) delete_book_section
-- Yalnızca bölümdeki hiçbir test kullanılmamışsa. book_tests'te
-- section_id ON DELETE CASCADE olduğu için bölüm silinince testleri de
-- gider — bu yüzden kontrol silmeden ÖNCE yapılıyor.
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_book_section(
  p_section_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.book_sections WHERE id = p_section_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.book_tests bt
    WHERE bt.section_id = p_section_id
      AND (
        EXISTS (SELECT 1 FROM public.homework_items hi WHERE hi.book_test_id = bt.id)
        OR EXISTS (SELECT 1 FROM public.test_completions tc WHERE tc.book_test_id = bt.id)
      )
  ) THEN
    RAISE EXCEPTION 'Bu bölümdeki testler ödevlerde veya tamamlama kayıtlarında kullanılmış, bölüm silinemez.';
  END IF;

  DELETE FROM public.book_sections WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id, 'deleted', true);
END;
$$;
