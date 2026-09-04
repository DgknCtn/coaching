-- ============================================================
-- 055_book_outline_import  —  Faz 5
--
-- TOPLU KİTAP İÇE AKTARMA.
--
-- SORUN: 3D TYT gibi bir kitabın ~60 alt bölümü bugün TEK TEK açılıyor.
-- Her biri için ayrı bir RPC çağrısı, ayrı bir form. Bu, öğretmenin ürüne
-- girerken ödediği en büyük bedel.
--
-- NEDEN TEK RPC: 60 ayrı add_book_subsection çağrısı 60 ayrı işlemdir.
-- 43'üncüde ağ koparsa kitap yarım kalır ve öğretmen nerede kaldığını
-- bilemez. Burada ya hepsi açılır ya hiçbiri.
--
-- NEDEN SİLMİYOR: mevcut bölümlerin ÜSTÜNE EKLER, temizlemez. İçe aktarma
-- dolu bir kitabı sıfırlasaydı, yanlış metni yapıştıran öğretmen aylarca
-- işlediği yapıyı ve ona bağlı tüm ilerlemeyi tek tıkla kaybederdi.
-- ============================================================

CREATE OR REPLACE FUNCTION public.import_book_outline(
  p_book_id UUID,
  -- [{ "title": "...", "subsections": [{ "title": "...",
  --    "test_start": 1, "test_end": 4 }] }]
  p_outline JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_order        INT;
  v_chapter      JSONB;
  v_sub          JSONB;
  v_chapter_id   UUID;
  v_sub_id       UUID;
  v_sub_order    INT;
  v_start        INT;
  v_end          INT;
  v_title        TEXT;
  v_chapters     INT := 0;
  v_subsections  INT := 0;
  v_tests        INT := 0;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF jsonb_typeof(p_outline) <> 'array' OR jsonb_array_length(p_outline) = 0 THEN
    RAISE EXCEPTION 'İçe aktarılacak bölüm yok';
  END IF;

  -- Yapıştırma kazasına karşı üst sınır; lib/book-import.ts ile aynı sayı.
  IF jsonb_array_length(p_outline) > 300 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 300 satır aktarılabilir';
  END IF;

  -- Yeni bölümler mevcutların ARDINA eklenir.
  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM public.book_sections
  WHERE book_id = p_book_id AND parent_section_id IS NULL;

  FOR v_chapter IN SELECT * FROM jsonb_array_elements(p_outline)
  LOOP
    v_title := TRIM(COALESCE(v_chapter->>'title', ''));
    IF v_title = '' THEN RAISE EXCEPTION 'Bölüm adı boş olamaz'; END IF;

    v_order := v_order + 1;

    INSERT INTO public.book_sections (workspace_id, book_id, title, order_index)
    VALUES (v_workspace_id, p_book_id, v_title, v_order)
    RETURNING id INTO v_chapter_id;

    v_chapters := v_chapters + 1;
    v_sub_order := 0;

    FOR v_sub IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_chapter->'subsections', '[]'::jsonb))
    LOOP
      v_title := TRIM(COALESCE(v_sub->>'title', ''));
      v_start := (v_sub->>'test_start')::INT;
      v_end   := (v_sub->>'test_end')::INT;

      IF v_title = '' THEN RAISE EXCEPTION 'Alt bölüm adı boş olamaz'; END IF;

      -- Aynı doğrulamalar add_book_subsection'daki (047) ile birebir:
      -- ikinci bir giriş yolu, ikinci bir kural kümesi demek olmamalı.
      IF v_start IS NULL OR v_end IS NULL OR v_start < 1 OR v_end < v_start THEN
        RAISE EXCEPTION 'Geçersiz test aralığı: %', v_title;
      END IF;

      IF (v_end - v_start + 1) > 200 THEN
        RAISE EXCEPTION 'Bir alt bölüm en fazla 200 test içerebilir: %', v_title;
      END IF;

      v_sub_order := v_sub_order + 1;

      INSERT INTO public.book_sections (
        workspace_id, book_id, title, order_index,
        parent_section_id, test_start, test_end
      )
      VALUES (
        v_workspace_id, p_book_id, v_title, v_sub_order,
        v_chapter_id, v_start, v_end
      )
      RETURNING id INTO v_sub_id;

      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
      SELECT v_workspace_id, p_book_id, v_sub_id, n || '. Test', n
      FROM generate_series(v_start, v_end) AS n;

      v_subsections := v_subsections + 1;
      v_tests := v_tests + (v_end - v_start + 1);
    END LOOP;
  END LOOP;

  PERFORM public.log_audit_event(
    v_workspace_id,
    'book.outline_import',
    'book',
    p_book_id,
    jsonb_build_object(
      'chapters', v_chapters,
      'subsections', v_subsections,
      'tests', v_tests
    )
  );

  RETURN jsonb_build_object(
    'chapters', v_chapters,
    'subsections', v_subsections,
    'tests', v_tests
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.import_book_outline(UUID, JSONB) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.import_book_outline(UUID, JSONB);
-- ============================================================
