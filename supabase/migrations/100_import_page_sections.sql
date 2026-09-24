-- ============================================================
-- 100 — SAYFA TAKİPLİ KİTAPTA TOPLU İÇE AKTARMA (R8)
--
-- SORUN: "İçindekilerden aktar" 055'ten beri var ama sayfa takipli
-- kitaplara hiç açılmamıştı. Arayüzde tek bir koşulla gizleniyordu
-- (`trackingMode !== 'page'`) ve gerekçesi şuydu: "sayfa takipli kitapta
-- bölümler test değil sayfa aralığı taşır; içindekiler aktarımı orada
-- anlamsız olurdu."
--
-- O GEREKÇE YANLIŞTI. Öğretmenin yapıştırdığı metin iki durumda da aynı:
-- başlık + sondaki sayı aralığı. Değişen tek şey aralığın NE ANLAMA
-- geldiği — test numarası değil sayfa numarası. Sayfa takipli kitabın 60
-- bölümü bugüne dek TEK TEK, elle giriliyordu; yani 055'in çözdüğü sorun
-- sayfa kitaplarında olduğu gibi duruyordu.
--
-- NEDEN YENİ RPC, `import_book_outline`'a MOD PARAMETRESİ DEĞİL
--
-- İkisinin ÜRETTİĞİ KAYIT farklı. Test modunda iki katmanlı bir ağaç
-- açılır (bölüm -> alt bölüm -> testler, `parent_section_id`/`test_start`).
-- Sayfa modunda yapı DÜZ: her satır tek bir `book_sections` satırıdır,
-- `page_start`/`page_end` taşır ve altına HER FİZİKSEL SAYFA için bir
-- `book_tests` satırı açılır (022'nin birim kararı). Tek fonksiyona
-- sıkıştırmak, gövdesinin tamamı iki ayrı dala bölünen bir fonksiyon
-- demekti.
--
-- Not: `import_book_outline`'da sunucu tarafı bir tracking_mode kontrolü
-- YOK; kısıt yalnız arayüzdeydi. Bu dosya o boşluğu da kapatıyor: aşağıdaki
-- fonksiyon kitabın `tracking_mode`'u 'page' DEĞİLSE reddeder, böylece
-- arayüz yanlış RPC'yi çağırsa bile sayfa kitabında test tarzı alt bölüm
-- açılamaz.
--
-- DOĞRULAMALAR `create_page_section` (022) İLE BİREBİR: mod 'page' olmalı,
-- başlık boş olamaz, aralık geçerli olmalı, bölüm başına en çok 1000
-- sayfa. 055'in kendi savunduğu ilke: ikinci bir giriş yolu, ikinci bir
-- kural kümesi demek olmamalı.
--
-- NEDEN TEK RPC: 60 ayrı create_page_section çağrısı 60 ayrı işlemdir;
-- 43'üncüde ağ koparsa kitap yarım kalır. Burada ya hepsi açılır ya
-- hiçbiri.
--
-- NEDEN SİLMİYOR: mevcut bölümlerin ARDINA ekler. Yanlış metin yapıştıran
-- öğretmen, aylarca işlediği yapıyı ve ona bağlı ilerlemeyi tek tıkla
-- kaybetmemeli.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

CREATE OR REPLACE FUNCTION public.import_page_sections(
  p_book_id UUID,
  -- [{ "title": "Üçgenler", "page_start": 1, "page_end": 56 }]
  p_sections JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_tracking     TEXT;
  v_order        INT;
  v_row          JSONB;
  v_section_id   UUID;
  v_title        TEXT;
  v_start        INT;
  v_end          INT;
  v_sections     INT := 0;
  v_pages        INT := 0;
BEGIN
  SELECT workspace_id, tracking_mode
    INTO v_workspace_id, v_tracking
  FROM public.books WHERE id = p_book_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- create_page_section ile aynı kapı: bu yol yalnız sayfa kitabı içindir.
  IF v_tracking <> 'page' THEN
    RAISE EXCEPTION 'Bu kitap sayfa aralığı ile takip edilmiyor';
  END IF;

  IF jsonb_typeof(p_sections) <> 'array' OR jsonb_array_length(p_sections) = 0 THEN
    RAISE EXCEPTION 'İçe aktarılacak bölüm yok';
  END IF;

  -- Yapıştırma kazasına karşı üst sınır; lib/book-import.ts ile aynı sayı.
  IF jsonb_array_length(p_sections) > 300 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 300 satır aktarılabilir';
  END IF;

  -- Yeni bölümler mevcutların ARDINA eklenir.
  SELECT COALESCE(MAX(order_index), 0) INTO v_order
  FROM public.book_sections
  WHERE book_id = p_book_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_title := TRIM(COALESCE(v_row->>'title', ''));
    v_start := (v_row->>'page_start')::INT;
    v_end   := (v_row->>'page_end')::INT;

    IF v_title = '' THEN RAISE EXCEPTION 'Bölüm adı boş olamaz'; END IF;

    IF v_start IS NULL OR v_end IS NULL OR v_start < 1 OR v_end < v_start THEN
      RAISE EXCEPTION 'Geçerli bir sayfa aralığı girin: %', v_title;
    END IF;

    IF (v_end - v_start + 1) > 1000 THEN
      RAISE EXCEPTION 'Bir bölüm en fazla 1000 sayfa olabilir: %', v_title;
    END IF;

    v_order := v_order + 1;

    INSERT INTO public.book_sections (
      workspace_id, book_id, title, order_index, page_start, page_end
    )
    VALUES (v_workspace_id, p_book_id, v_title, v_order, v_start, v_end)
    RETURNING id INTO v_section_id;

    -- Her sayfa bir birim satırı; order_index = sayfa no (022).
    INSERT INTO public.book_tests (
      workspace_id, book_id, section_id, title, order_index, page_start, page_end
    )
    SELECT v_workspace_id, p_book_id, v_section_id, 'sf. ' || n, n, n, n
    FROM generate_series(v_start, v_end) AS n;

    v_sections := v_sections + 1;
    v_pages := v_pages + (v_end - v_start + 1);
  END LOOP;

  PERFORM public.log_audit_event(
    v_workspace_id,
    'book.outline_import',
    'book',
    p_book_id,
    jsonb_build_object(
      'mode', 'page',
      'sections', v_sections,
      'pages', v_pages
    )
  );

  RETURN jsonb_build_object(
    'sections', v_sections,
    'pages', v_pages
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.import_page_sections(UUID, JSONB) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.import_page_sections(UUID, JSONB);
-- ============================================================
