-- ============================================================
-- 076_subsection_conversion  (R7-03 Revize — iki açık kapanıyor)
--
-- ============================================================
-- AÇIK 1: "ALT BÖLÜM EKLE" PRATİKTE ERİŞİLEMEZDİ
-- ============================================================
-- add_book_subsection (061:270) bölümün kendi testleri varsa reddediyor
-- ve şunu söylüyordu: "önce bölümün test sayısını sıfırlayın".
--
-- Bu talimat İMKÂNSIZDI. Test sayısı üç katmanda birden 1'in altına
-- inemiyor:
--   UI      book-edit-form.tsx  <Input min={1}>
--   Zod     lib/validation.ts   .min(1, 'Bölümde en az 1 test olmalı.')
--   SQL     018:168             IF p_test_count < 1 ... RAISE
--
-- Sonuç: alt bölüm YALNIZ hiç testi olmayan, sıfırdan bir bölüme
-- eklenebiliyordu. Eski usulde ("Bölüm + Test Sayısı") girilmiş her
-- kitapta özellik ölüydü — yani tam da şartnamenin yazılma sebebi olan
-- 3D TYT vakasında.
--
-- ÇÖZÜM: 0'a izin vermek DEĞİL, tek işlemde dönüştürmek.
--
-- Neden 0'a izin verilmedi: testsiz bölüm yeni bir ara durum olurdu ve
-- `orderLeafSections` (lib/book-structure.ts) testi olmayan bölümü
-- düşürdüğü için bölüm Kitap Haritasından geçici olarak KAYBOLURDU.
-- Öğretmen "sildim mi?" diye düşünürdü. Atomik dönüşüm bu limboya hiç
-- girmez ve 1..200 değişmezi olduğu gibi kalır.
--
-- ============================================================
-- AÇIK 2: import_book_outline SAYFA KİTABINI REDDETMİYORDU
-- ============================================================
-- 055 kitaptan yalnız workspace_id okuyordu, tracking_mode'a hiç
-- bakmıyordu. 061'in add_book_subsection'a eklediği "sayfa kaynağında
-- alt bölüm açılamaz" koruması BURADAN ATLANABİLİYORDU: sayfa takipli
-- bir kitaba test aralıklı outline aktarıldığında alt bölümler VE
-- book_tests satırları üretiliyor, şartnamenin tek cümlelik kuralı
-- çiğneniyordu:
--
--     "Aynı kaynakta iki ayrı ilerleme sayacı oluşmaz."
--
-- Bir kural iki ayrı yoldan uygulanıyorsa, kapatılmayan yol kuralın
-- kendisidir.
-- ============================================================


-- ============================================================
-- 1) convert_section_to_subsections
--
-- Bölümün kendi testlerini kaldırır ve ilk alt bölümü AYNI İŞLEMDE
-- oluşturur. Ya ikisi de olur ya hiçbiri.
--
-- KULLANILMIŞ TEST VARSA REDDEDİLİR: 018'in azaltma korumasıyla
-- (018:191-206) aynı davranış. Öğrenci geçmişi sessizce silinmez;
-- hata engelleyen testin adını söyler ki öğretmen neyi çözeceğini
-- bilsin.
--
-- delete_book_subsection (047:304) yalnız homework_items'a bakıyor;
-- burada test_completions da kontrol edilir. Tamamlanmış bir testi
-- silmek, öğrencinin yaptığı işi yok etmek demektir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.convert_section_to_subsections(
  p_section_id UUID,
  p_title      TEXT,
  p_test_start INTEGER,
  p_test_end   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_book_id      UUID;
  v_parent       UUID;
  v_tracking     TEXT;
  v_removed      INT;
  v_order        INT;
  v_new_id       UUID;
  v_blocked      RECORD;
BEGIN
  SELECT s.workspace_id, s.book_id, s.parent_section_id, b.tracking_mode
    INTO v_workspace_id, v_book_id, v_parent, v_tracking
  FROM public.book_sections s
  JOIN public.books b ON b.id = s.book_id
  WHERE s.id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Sayfa kaynağı: 061 ile aynı gerekçe ve aynı metin.
  IF v_tracking = 'page' THEN
    RAISE EXCEPTION 'Sayfa ile takip edilen kaynakta alt bölüm açılamaz; test aralığı yalnız bilgi olarak girilebilir';
  END IF;

  -- İki seviye sınırı.
  IF v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Alt bölümün altına yeni alt bölüm eklenemez';
  END IF;

  -- Zaten alt bölümü varsa dönüştürecek bir şey yok; normal ekleme yolu
  -- kullanılmalı. Bu dalın çalışması, arayüzün yanlış düğmeyi gösterdiği
  -- anlamına gelir.
  IF EXISTS (
    SELECT 1 FROM public.book_sections WHERE parent_section_id = p_section_id
  ) THEN
    RAISE EXCEPTION 'Bu bölüm zaten alt bölümlere ayrılmış; yeni alt bölümü doğrudan ekleyin';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Alt bölüm adı boş olamaz';
  END IF;

  IF p_test_start IS NULL OR p_test_end IS NULL
     OR p_test_start < 1 OR p_test_end < p_test_start THEN
    RAISE EXCEPTION 'Geçerli bir test aralığı girin';
  END IF;

  IF (p_test_end - p_test_start + 1) > 200 THEN
    RAISE EXCEPTION 'Bir alt bölüm en fazla 200 test içerebilir';
  END IF;

  -- Kaldırılacak testlerden biri kullanılmış mı? (018:191-206 kalıbı)
  SELECT bt.title INTO v_blocked
  FROM public.book_tests bt
  WHERE bt.section_id = p_section_id
    AND (
      EXISTS (SELECT 1 FROM public.homework_items hi WHERE hi.book_test_id = bt.id)
      OR EXISTS (SELECT 1 FROM public.test_completions tc WHERE tc.book_test_id = bt.id)
    )
  ORDER BY bt.order_index
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Bu bölüm alt bölümlere ayrılamaz: "%" bir ödevde veya tamamlama kaydında kullanılmış.',
      v_blocked.title;
  END IF;

  SELECT COUNT(*) INTO v_removed
  FROM public.book_tests WHERE section_id = p_section_id;

  DELETE FROM public.book_tests WHERE section_id = p_section_id;

  -- Buradan aşağısı add_book_subsection'ın gövdesiyle aynı (061:276-290).
  -- Ortak bir yardımcıya çıkarılmadı: iki fonksiyon arasında paylaşılan
  -- tek şey bu insert çifti ve plpgsql'de bunu ayırmak, çağrı zincirini
  -- okumayı kolaylaştırmaktan çok zorlaştırırdı.
  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_sections WHERE parent_section_id = p_section_id;

  INSERT INTO public.book_sections (
    workspace_id, book_id, title, order_index,
    parent_section_id, test_start, test_end
  )
  VALUES (
    v_workspace_id, v_book_id, TRIM(p_title), v_order,
    p_section_id, p_test_start, p_test_end
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
  SELECT v_workspace_id, v_book_id, v_new_id, n || '. Test', n
  FROM generate_series(p_test_start, p_test_end) AS n;

  RETURN jsonb_build_object(
    'subsection_id', v_new_id,
    'test_count', p_test_end - p_test_start + 1,
    'removed_tests', v_removed
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.convert_section_to_subsections(UUID, TEXT, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 2) add_book_subsection — yalnız HATA METNİ düzeltiliyor
--
-- Kural aynı kalıyor (bölümün kendi testleri varsa alt bölüm eklenemez).
-- Değişen tek şey, öğretmene imkânsız bir iş söylememesi: artık
-- "test sayısını sıfırlayın" değil, gerçekten var olan yolu gösteriyor.
--
-- Gövdenin geri kalanı 061'deki hâliyle birebir aynı; CREATE OR REPLACE
-- olduğu için fonksiyonun tamamı yeniden yazılmak zorunda.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_book_subsection(
  p_section_id UUID,
  p_title      TEXT,
  p_test_start INTEGER,
  p_test_end   INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_book_id      UUID;
  v_parent       UUID;
  v_tracking     TEXT;
  v_order        INT;
  v_new_id       UUID;
BEGIN
  SELECT s.workspace_id, s.book_id, s.parent_section_id, b.tracking_mode
    INTO v_workspace_id, v_book_id, v_parent, v_tracking
  FROM public.book_sections s
  JOIN public.books b ON b.id = s.book_id
  WHERE s.id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_tracking = 'page' THEN
    RAISE EXCEPTION 'Sayfa ile takip edilen kaynakta alt bölüm açılamaz; test aralığı yalnız bilgi olarak girilebilir';
  END IF;

  IF v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'Alt bölümün altına yeni alt bölüm eklenemez';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Alt bölüm adı boş olamaz';
  END IF;

  IF p_test_start IS NULL OR p_test_end IS NULL
     OR p_test_start < 1 OR p_test_end < p_test_start THEN
    RAISE EXCEPTION 'Geçerli bir test aralığı girin';
  END IF;

  IF (p_test_end - p_test_start + 1) > 200 THEN
    RAISE EXCEPTION 'Bir alt bölüm en fazla 200 test içerebilir';
  END IF;

  -- ÇAKIŞMA KONTROLÜ YOK, bilinçli: şartname aynı numaranın farklı alt
  -- bölümlerde tekrar etmesine açıkça izin veriyor.

  -- 076: metin değişti. Eskiden "test sayısını sıfırlayın" diyordu ve bu
  -- yapılamıyordu; artık gerçek yolu gösteriyor.
  IF EXISTS (SELECT 1 FROM public.book_tests WHERE section_id = p_section_id) THEN
    RAISE EXCEPTION 'Bu bölümün kendi testleri var; önce "Alt bölümlere ayır" ile bölümü dönüştürün';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_sections WHERE parent_section_id = p_section_id;

  INSERT INTO public.book_sections (
    workspace_id, book_id, title, order_index,
    parent_section_id, test_start, test_end
  )
  VALUES (
    v_workspace_id, v_book_id, TRIM(p_title), v_order,
    p_section_id, p_test_start, p_test_end
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
  SELECT v_workspace_id, v_book_id, v_new_id, n || '. Test', n
  FROM generate_series(p_test_start, p_test_end) AS n;

  RETURN jsonb_build_object(
    'subsection_id', v_new_id,
    'test_count', p_test_end - p_test_start + 1
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.add_book_subsection(UUID, TEXT, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 3) import_book_outline — sayfa kitabı reddi (AÇIK 2)
--
-- Tek değişiklik: kitap sorgusu tracking_mode'u da okur ve 'page' ise
-- reddeder. Gövdenin geri kalanı 055'teki hâliyle aynı.
--
-- Reddin outline DOĞRULAMASINDAN ÖNCE gelmesi bilinçli: öğretmene
-- "3. satırdaki aralık hatalı" demek, asıl sorun kitabın türü olduğunda
-- yanlış yere bakmasına yol açardı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.import_book_outline(
  p_book_id UUID,
  p_outline JSONB
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
  SELECT workspace_id, tracking_mode INTO v_workspace_id, v_tracking
  FROM public.books WHERE id = p_book_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- 076: kapatılmamış ikinci yol. Bu fonksiyon alt bölüm VE book_tests
  -- satırı üretiyor; sayfa kaynağında çalışması "aynı kaynakta iki ayrı
  -- ilerleme sayacı oluşmaz" kuralını çiğnerdi.
  IF v_tracking = 'page' THEN
    RAISE EXCEPTION 'Sayfa ile takip edilen kaynağa içindekiler aktarılamaz; alt bölüm ve test üretmez';
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
--   DROP FUNCTION IF EXISTS public.convert_section_to_subsections(UUID, TEXT, INTEGER, INTEGER);
--   -- add_book_subsection ve import_book_outline için 061 ve 055'teki
--   -- sürümleri yeniden çalıştırın.
-- ============================================================
