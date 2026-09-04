-- ============================================================
-- 061_page_section_test_range  —  R7-03 REVİZE
--
-- SAYFA İLE TAKİPTE OPSİYONEL TEST ARALIĞI.
--
-- Gerçek vaka (Barış İntegral Fasikülü): kaynak sayfa üzerinden
-- ilerliyor ama bölüm içindeki "Test 1-6" bilgisi öğretmene ve
-- öğrenciye referans olarak değerli.
--
-- ============================================================
-- ŞARTNAMENİN KIRMIZI ÇİZGİSİ
--
--   "Aynı kaynakta iki ayrı ilerleme sayacı oluşmaz."
--
-- Sayfa kitabında test aralığı YALNIZ BİLGİDİR: ikinci yüzde, ikinci
-- tik listesi, ikinci ödev motoru üretmez.
--
-- ============================================================
-- NEDEN AYRI SÜTUN AÇILMIYOR
--
-- `test_start`/`test_end`'in anlamı "kitapta yazan test aralığı" —
-- basılı kitap hakkında bir OLGU. Bu aralığın takip birimi üretip
-- üretmediği sütunun değil `books.tracking_mode`'un işi.
--
-- `info_test_start` gibi ikinci bir çift, aynı olguyu iki yerde
-- tutmak olurdu; sayfa->test dönüşümü de "bir sütundan diğerine
-- kopyala" gibi yapay bir işe dönerdi.
--
-- KARŞILIĞINDA ÜRETİM YOLU SIKICA KAPATILIYOR: aşağıdaki
-- set_section_test_range_info yalnız iki sütunu yazar ve
-- add_book_subsection sayfa kitaplarını açıkça reddeder.
-- ============================================================


-- ============================================================
-- 1) set_section_test_range_info — bilgi amaçlı aralık
--
-- Fonksiyonun TAMAMI tek UPDATE. `book_tests`'e dokunmaması bir
-- yorum vaadi değil, kodun kendisi.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_section_test_range_info(
  p_section_id UUID,
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
  v_tracking     TEXT;
BEGIN
  SELECT s.workspace_id, s.book_id, b.tracking_mode
    INTO v_workspace_id, v_book_id, v_tracking
  FROM public.book_sections s
  JOIN public.books b ON b.id = s.book_id
  WHERE s.id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- YALNIZ SAYFA KİTAPLARI. Test kitabında aralık girmenin tek meşru
  -- yolu üretken RPC'lerdir (add_book_subsection,
  -- set_subsection_test_range); bu fonksiyonun oradan da
  -- çağrılabilmesi, aynı sütun için iki doğruluk kaynağı demekti.
  IF v_tracking <> 'page' THEN
    RAISE EXCEPTION 'Bilgi amaçlı test aralığı yalnız sayfa ile takip edilen kaynaklarda kullanılır';
  END IF;

  -- NULL KABUL EDİLİR ve aralığı temizler. Şartname açıkça istiyor:
  -- ÖSYM Bakış, Son Bakış, Kişisel Testler aralıksız çalışmalı.
  IF p_test_start IS NOT NULL OR p_test_end IS NOT NULL THEN
    IF p_test_start IS NULL OR p_test_end IS NULL THEN
      RAISE EXCEPTION 'İlk ve son test birlikte girilmeli';
    END IF;
    IF p_test_start < 1 OR p_test_end < p_test_start THEN
      RAISE EXCEPTION 'Geçerli bir test aralığı girin';
    END IF;
    -- Üst sınır add_book_subsection ile aynı: bir veri girişi hatası
    -- sessizce dev bir aralık olarak kaydedilmesin.
    IF (p_test_end - p_test_start + 1) > 200 THEN
      RAISE EXCEPTION 'Bir bölüm en fazla 200 test aralığı taşıyabilir';
    END IF;
  END IF;

  UPDATE public.book_sections
  SET test_start = p_test_start,
      test_end   = p_test_end,
      updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id, 'informational', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_section_test_range_info(UUID, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 2) create_page_section — opsiyonel test aralığı parametreleri
--
-- Sayfa satırları AYNEN bugünkü gibi üretilir; yeni parametreler
-- yalnız iki sütuna yazılır.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_page_section(UUID, TEXT, INTEGER, INTEGER, TEXT);

CREATE FUNCTION public.create_page_section(
  p_book_id    UUID,
  p_title      TEXT,
  p_page_start INTEGER,
  p_page_end   INTEGER,
  p_note       TEXT DEFAULT NULL,
  p_test_start INTEGER DEFAULT NULL,
  p_test_end   INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_tracking     TEXT;
  v_section_id   UUID;
  v_order        INT;
BEGIN
  SELECT workspace_id, tracking_mode INTO v_workspace_id, v_tracking
  FROM public.books WHERE id = p_book_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_tracking <> 'page' THEN
    RAISE EXCEPTION 'Bu kitap sayfa aralığı ile takip edilmiyor';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Bölüm adı boş olamaz';
  END IF;

  IF p_page_start IS NULL OR p_page_end IS NULL OR p_page_start < 1 OR p_page_end < p_page_start THEN
    RAISE EXCEPTION 'Geçerli bir sayfa aralığı girin';
  END IF;

  -- 5000 sayfalık bir bölüm bir veri girişi hatasıdır; sessizce 5000 satır
  -- açmak yerine erken uyarmak daha güvenli.
  IF (p_page_end - p_page_start + 1) > 1000 THEN
    RAISE EXCEPTION 'Bir bölüm en fazla 1000 sayfa olabilir';
  END IF;

  -- Test aralığı OPSİYONEL ve bilgi amaçlı; doğrulaması var ama hiçbir
  -- satır üretmiyor.
  IF p_test_start IS NOT NULL OR p_test_end IS NOT NULL THEN
    IF p_test_start IS NULL OR p_test_end IS NULL THEN
      RAISE EXCEPTION 'İlk ve son test birlikte girilmeli';
    END IF;
    IF p_test_start < 1 OR p_test_end < p_test_start THEN
      RAISE EXCEPTION 'Geçerli bir test aralığı girin';
    END IF;
  END IF;

  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_sections WHERE book_id = p_book_id;

  INSERT INTO public.book_sections (
    workspace_id, book_id, title, order_index, note,
    page_start, page_end, test_start, test_end
  )
  VALUES (
    v_workspace_id, p_book_id, TRIM(p_title), v_order,
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    p_page_start, p_page_end, p_test_start, p_test_end
  )
  RETURNING id INTO v_section_id;

  -- Her SAYFA bir birim satırı — takip birimi buradan gelir, test
  -- aralığından DEĞİL. order_index = sayfa no, böylece matris sütunu
  -- ile fiziksel sayfa numarası aynı şeyi ifade eder.
  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
  SELECT v_workspace_id, p_book_id, v_section_id, 'sf. ' || n, n, n, n
  FROM generate_series(p_page_start, p_page_end) AS n;

  RETURN jsonb_build_object(
    'section_id', v_section_id,
    'page_count', p_page_end - p_page_start + 1
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.create_page_section(UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO authenticated;


-- ============================================================
-- 3) ÜRETKEN YOL SAYFA KİTAPLARINA AÇIKÇA KAPATILIYOR
--
-- add_book_subsection bugün de sayfa bölümlerini reddediyor ama
-- DOLAYLI olarak: "bu bölümün kendi testleri var" kontrolüne takılıyor,
-- çünkü sayfa bölümlerinin sayfa başına bir satırı var.
--
-- Kazara çalışan bir korumaya güvenmek, bir gün o kazanın bozulması
-- demektir. Açık kontrol ve anlaşılır hata mesajı ekleniyor.
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

  -- YENİ (061): açık kapı. Sayfa kitabında alt bölüm açmak, ikinci bir
  -- ilerleme sayacı yaratmak olurdu.
  IF v_tracking = 'page' THEN
    RAISE EXCEPTION 'Sayfa ile takip edilen kaynakta alt bölüm açılamaz; test aralığı yalnız bilgi olarak girilebilir';
  END IF;

  -- İki seviye sınırı.
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

  IF EXISTS (SELECT 1 FROM public.book_tests WHERE section_id = p_section_id) THEN
    RAISE EXCEPTION 'Bu bölümün kendi testleri var; alt bölüm eklemeden önce bölümün test sayısını sıfırlayın';
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
-- 4) SAYFA -> TEST DÖNÜŞÜMÜ
--
-- Kullanıcı kararı: onay istenir ve bilgi amaçlı aralıklar TAKİP
-- VERİSİNE dönüşür. Girilmiş emek korunur, ne olacağı önceden görülür.
-- ============================================================

-- ------------------------------------------------------------
-- preview_tracking_mode_change — hiçbir şey değiştirmez
--
-- Onay diyaloğunun rakamları buradan gelir. Arayüzün kendi hesabını
-- yapması, sunucunun yapacağından farklı bir sayı göstermesi riskini
-- doğururdu.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_tracking_mode_change(
  p_book_id       UUID,
  p_tracking_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_current      TEXT;
  v_sections     INT;
  v_tests        INT;
BEGIN
  SELECT workspace_id, tracking_mode INTO v_workspace_id, v_current
  FROM public.books WHERE id = p_book_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    COUNT(*)::INT,
    COALESCE(SUM(test_end - test_start + 1), 0)::INT
  INTO v_sections, v_tests
  FROM public.book_sections
  WHERE book_id = p_book_id
    AND test_start IS NOT NULL
    AND test_end IS NOT NULL;

  RETURN jsonb_build_object(
    'current_mode', v_current,
    'target_mode', p_tracking_mode,
    'has_progress', public.book_has_progress(p_book_id),
    -- Yalnız sayfa -> test yönünde anlamlı: diğer yönlerde aralıklar
    -- takip verisine dönüşmez.
    'converts_ranges', (v_current = 'page' AND p_tracking_mode = 'test' AND v_sections > 0),
    'sections_with_range', v_sections,
    'tests_to_create', v_tests
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.preview_tracking_mode_change(UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- set_book_tracking_mode — onay parametresi eklendi
--
-- Aralık varken onaysız çağrı HATA VERİR. Sessizce dönüştürmek,
-- öğretmenin kitabının bir anda yüzlerce teste bölündüğünü sonradan
-- fark etmesi demekti.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_book_tracking_mode(UUID, TEXT);

CREATE FUNCTION public.set_book_tracking_mode(
  p_book_id       UUID,
  p_tracking_mode TEXT,
  p_confirm_test_generation BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_current      TEXT;
  v_sections     INT;
  v_created      INT := 0;
  r              RECORD;
BEGIN
  SELECT workspace_id, tracking_mode INTO v_workspace_id, v_current
  FROM public.books WHERE id = p_book_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_tracking_mode NOT IN ('test', 'page', 'section', 'step', 'trial') THEN
    RAISE EXCEPTION 'Geçersiz takip türü';
  END IF;

  IF p_tracking_mode = v_current THEN
    RETURN jsonb_build_object('book_id', p_book_id, 'tracking_mode', v_current, 'changed', false);
  END IF;

  IF public.book_has_progress(p_book_id) THEN
    RAISE EXCEPTION 'Bu kaynakta ilerleme başlamış; takip türü değiştirilemez';
  END IF;

  -- Sayfa -> Test: bilgi amaçlı aralıklar takip verisine dönüşecek.
  SELECT COUNT(*)::INT INTO v_sections
  FROM public.book_sections
  WHERE book_id = p_book_id AND test_start IS NOT NULL AND test_end IS NOT NULL;

  IF v_current = 'page' AND p_tracking_mode = 'test' AND v_sections > 0
     AND NOT p_confirm_test_generation THEN
    RAISE EXCEPTION 'Bu kaynakta % bölümde bilgi amaçlı test aralığı var; dönüşüm için onay gerekiyor', v_sections;
  END IF;

  -- İlerleme yok: eski birim satırları hiçbir yere bağlı değil.
  DELETE FROM public.book_tests WHERE book_id = p_book_id;

  IF v_current = 'page' AND p_tracking_mode = 'test' AND v_sections > 0 THEN
    -- Aralıklar artık ÜRETİM GİRDİSİ. Aynı sütunlar, yeni anlam.
    FOR r IN
      SELECT id, test_start, test_end
      FROM public.book_sections
      WHERE book_id = p_book_id AND test_start IS NOT NULL AND test_end IS NOT NULL
    LOOP
      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
      SELECT v_workspace_id, p_book_id, r.id, n || '. Test', n
      FROM generate_series(r.test_start, r.test_end) AS n;

      v_created := v_created + (r.test_end - r.test_start + 1);
    END LOOP;
  END IF;

  -- Sayfa modundan çıkılıyorsa bölümlerin sayfa aralığı anlamını yitirir.
  IF v_current = 'page' AND p_tracking_mode <> 'page' THEN
    UPDATE public.book_sections
    SET page_start = NULL, page_end = NULL, updated_at = NOW()
    WHERE book_id = p_book_id;
  END IF;

  -- Test modundan ÇIKILIYORSA aralıklar bilgiye döner; silinmez.
  -- Öğretmenin girdiği veri, mod değiştirdi diye kaybolmamalı.

  UPDATE public.books
  SET tracking_mode = p_tracking_mode, updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object(
    'book_id', p_book_id,
    'tracking_mode', p_tracking_mode,
    'changed', true,
    'tests_created', v_created
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_book_tracking_mode(UUID, TEXT, BOOLEAN) TO authenticated;


-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.set_book_tracking_mode(UUID, TEXT, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.preview_tracking_mode_change(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.set_section_test_range_info(UUID, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.create_page_section(UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER);
--   -- create_page_section (022), add_book_subsection (047) ve
--   -- set_book_tracking_mode (042) eski sürümlerine dönülür.
-- ============================================================
