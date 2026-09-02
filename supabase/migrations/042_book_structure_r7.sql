-- ============================================================
-- 042_book_structure_r7  (R7-02 §6.2 - §7.1, §11)
--
-- R7-02 uygulama talimatının veri tarafı. Dört iş yapar:
--
--   1) books.resource_type   — Kaynak Türü (sınıflama/filtre/etiket).
--   2) books.structure_kind  — Tek Parça / Çok Parçalı.
--   3) book_parts + book_sections.part_id — Kaynak > Parça > Bölüm.
--   4) tracking_mode ve video_mode CHECK'lerinin genişletilmesi + 0
--      ilerlemeli kaynakta yapı düzenlemesini açan RPC'ler.
--
-- ANA KURAL: yeni özellik üretilmez, mevcut yapı korunur. Bu yüzden burada
-- YENİ BİR TAKİP BİRİMİ TABLOSU YOKTUR: 'section', 'step' ve 'trial'
-- türlerinin birimleri de 022'deki gibi book_tests satırlarıdır. Yüzde ve
-- tempo matematiği (lib/plan-scope.ts, lib/plan-pace.ts) hiç değişmez;
-- Parça yalnız GRUPLAMA katmanıdır, takip birimi değildir.
--
-- MEVCUT VERİ (§11 "Mevcut veri migration"):
--   * Hiçbir kitap silinmez, hiçbir bölüm taşınmaz.
--   * resource_type eski kayıtlarda 'Belirtilmedi', structure_kind 'single'.
--   * group_label / theme_label (035) KOLON OLARAK KALIR ve kör
--     otomasyonla Parça'ya çevrilmez — MÖF gibi bilinen kaynaklarda manuel
--     doğrulama daha güvenlidir. UI'dan kaldırılır, veri durur.
--   * video_mode'un eski 'book'/'section' değerleri dönüştürülmez.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) books: Kaynak Türü + Kaynak Yapısı
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS resource_type  TEXT NOT NULL DEFAULT 'Belirtilmedi',
  ADD COLUMN IF NOT EXISTS structure_kind TEXT NOT NULL DEFAULT 'single';

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_resource_type_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_resource_type_check
  CHECK (resource_type IN (
    'Belirtilmedi', 'Soru Bankası', 'Ders/Konu Anlatım Kitabı',
    'Video Destekli Defter', 'Çalışma Kitabı/Defteri', 'Kamp Kitabı',
    'Fasikül', 'Deneme', 'Çıkmış Sorular', 'Föy/Modül',
    'Ders Notu/Konu Özeti'
  ));

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_structure_kind_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_structure_kind_check
  CHECK (structure_kind IN ('single', 'multi'));

COMMENT ON COLUMN public.books.resource_type IS
  'R7-02: Kaynak Türü. Yalnız sınıflama/filtre/etiket; aynı türden ikinci '
  'kitabı engellemez ve hiçbir hesaba girmez.';

COMMENT ON COLUMN public.books.structure_kind IS
  'R7-02: single = Bölümler doğrudan; multi = önce Parça, Bölümler parçanın '
  'içinde. Çok parçalı kaynak yine TEK kaynaktır.';

-- Havuz filtresi ders/seviye/baskı yılı üzerinden gidiyordu (021); tür de
-- artık filtrelenebilir bir alan.
CREATE INDEX IF NOT EXISTS idx_books_resource_type
  ON public.books (workspace_id, resource_type);

-- ============================================================
-- 2) tracking_mode genişlemesi (§6.5)
--
-- 'test' ve 'page' anlamları DEĞİŞMEDİ. Üç yeni tür aynı book_tests
-- yapısını kullanır; fark yalnız kullanıcıya görünen birim adıdır
-- (lib/unit-labels.ts).
-- ============================================================
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_tracking_mode_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_tracking_mode_check
  CHECK (tracking_mode IN ('test', 'page', 'section', 'step', 'trial'));

-- ============================================================
-- 3) video_mode -> Video Kullanımı (§7.1)
--
-- Alan ADI ve kolonu korunur; seçenek kümesi değişir. Eski 'book' ve
-- 'section' değerleri CHECK'te KALIR: mevcut kayıtlar geçersiz duruma
-- düşmemeli. Yeni kayıtlarda UI bu ikisini "(eski)" olarak gösterir.
-- ============================================================
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_video_mode_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_video_mode_check
  CHECK (video_mode IN (
    'none', 'solution_videos', 'video_course', 'mixed',
    'book', 'section'
  ));

COMMENT ON COLUMN public.books.video_mode IS
  'R7-02: Video Kullanımı. none | solution_videos | video_course | mixed. '
  'book/section R4 döneminden kalan geriye dönük değerlerdir.';

-- ============================================================
-- 4) book_parts — Kaynak > Parça > Bölüm (§6.4)
--
-- NEDEN AYRI TABLO: fasikül bilgisi bugün book_sections.group_label'da
-- SERBEST METİN (035). Bu çalıştı ama yeniden adlandırılabilir, sıralanabilir
-- ve seçilebilir bir nesne değil. MÖF'te F1 yaklaşık 150 sayfa olduğu için
-- gerçek ödev birimi (Üslü Sayılar) kaba fasikül bloğunun içinde kayboluyor.
--
-- NEDEN TAKİP BİRİMİ DEĞİL: parça bir gruplama katmanıdır. İlerleme yine
-- bölüm ve birim üzerinden hesaplanır; MÖF öğrencide TEK plan ve TEK toplam
-- yüzde olarak görünmeye devam eder.
--
-- part_id NULLABLE: tek parçalı kaynakların bölümleri parçasızdır ve öyle
-- kalır. Bu, mevcut yüzlerce bölüm kaydının hiç dokunulmadan çalışması
-- demektir.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.book_parts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  book_id      UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  order_index  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_parts_book
  ON public.book_parts (book_id, order_index);

-- Aynı kitapta aynı adla iki parça olmasın: "F1" tektir.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_book_part_title
  ON public.book_parts (book_id, lower(btrim(title)));

DROP TRIGGER IF EXISTS handle_updated_at ON public.book_parts;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.book_parts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS part_id UUID
    REFERENCES public.book_parts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.book_sections.part_id IS
  'R7-02: bölümün bağlı olduğu Parça (fasikül/cilt/modül). NULL = tek '
  'parçalı kaynak. Takip birimi değil, gruplama katmanıdır.';

CREATE INDEX IF NOT EXISTS idx_book_sections_part
  ON public.book_sections (part_id)
  WHERE part_id IS NOT NULL;

-- RLS: bölümle AYNI görünürlük. Öğrenci ve veli atanmış kitabın parçalarını
-- görebilmeli, yoksa harita gruplaması onlarda boş çıkar (026 deseni).
ALTER TABLE public.book_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_parts_select ON public.book_parts;
CREATE POLICY book_parts_select ON public.book_parts
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_parts.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_parts.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS book_parts_write ON public.book_parts;
CREATE POLICY book_parts_write ON public.book_parts
  FOR ALL
  USING ((SELECT public.has_workspace_role(book_parts.workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(book_parts.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- 5) book_has_progress — tek kilit ölçütü (§6.5)
--
-- "0 onaylı/bekleyen ilerleme varsa yapı düzenlenebilir." 018'de bu ölçüt
-- set_section_test_count ve delete_book_section içinde SATIR düzeyinde
-- kontrol ediliyordu; burada aynı ölçüt KİTAP düzeyine çıkarılır. O iki
-- RPC'ye dokunulmaz — davranışları aynen korunur.
-- ============================================================
CREATE OR REPLACE FUNCTION public.book_has_progress(p_book_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.homework_items hi
    JOIN public.book_tests bt ON bt.id = hi.book_test_id
    WHERE bt.book_id = p_book_id
  ) OR EXISTS (
    SELECT 1 FROM public.test_completions tc
    JOIN public.book_tests bt ON bt.id = tc.book_test_id
    WHERE bt.book_id = p_book_id AND tc.status = 'active'
  );
$fn$;

COMMENT ON FUNCTION public.book_has_progress(UUID) IS
  'R7-02: kaynakta ödev veya aktif tamamlama kaydı var mı? Yapısal '
  'düzenlemenin (takip türü, sayfa aralığı) tek kilit ölçütü.';

-- ============================================================
-- 6) set_book_tracking_mode (§6.5, kabul #1)
--
-- "3D VDD gibi 0 ilerlemeli yarım kayıt, takip türü dahil tamamen
-- düzeltilebiliyor." 018 bu alanı bilinçli olarak dışarıda bırakmıştı;
-- gerekçe hâlâ geçerli, bu yüzden kilit KALDIRILMIYOR, yalnız ilerlemenin
-- OLMADIĞI kayıtlar için açılıyor.
--
-- Tür değiştiğinde mevcut birim satırları anlamsızlaşır ve SİLİNİR. Bu
-- güvenlidir: ilerleme yoksa hiçbir ödev/tamamlama kaydı bu satırlara
-- bağlı değildir. Bölümler ve adları korunur; sayfa moduna geçişte
-- bölümün sayfa aralığı sonradan set_section_page_range ile kurulur.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_book_tracking_mode(
  p_book_id       UUID,
  p_tracking_mode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_current      TEXT;
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

  -- İlerleme yok: eski birim satırları hiçbir yere bağlı değil.
  DELETE FROM public.book_tests WHERE book_id = p_book_id;

  -- Sayfa modundan çıkılıyorsa bölümlerin sayfa aralığı anlamını yitirir.
  IF v_current = 'page' AND p_tracking_mode <> 'page' THEN
    UPDATE public.book_sections
    SET page_start = NULL, page_end = NULL, updated_at = NOW()
    WHERE book_id = p_book_id;
  END IF;

  UPDATE public.books
  SET tracking_mode = p_tracking_mode, updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id, 'tracking_mode', p_tracking_mode, 'changed', true);
END;
$fn$;

-- ============================================================
-- 7) set_section_page_range (§6.5, kabul #2)
--
-- "Sayfa ile takipte 84-96 girilen bölüm Düzenle ekranında tekrar 84 / 96
-- olarak görünüyor." Değerler 022'den beri book_sections.page_start/end'de
-- SAKLANIYOR; eksik olan onları düzenleyebilmekti.
--
-- Aralık değişince birim satırları create_page_section ile AYNI mantıkla
-- yeniden kurulur. Yalnız o bölümde ilerleme yokken çalışır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_section_page_range(
  p_section_id UUID,
  p_page_start INTEGER,
  p_page_end   INTEGER
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
  SELECT bs.workspace_id, bs.book_id, b.tracking_mode
    INTO v_workspace_id, v_book_id, v_tracking
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

  IF p_page_start IS NULL OR p_page_end IS NULL OR p_page_start < 1 OR p_page_end < p_page_start THEN
    RAISE EXCEPTION 'Geçerli bir sayfa aralığı girin';
  END IF;

  IF (p_page_end - p_page_start + 1) > 1000 THEN
    RAISE EXCEPTION 'Bir bölüm en fazla 1000 sayfa olabilir';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    JOIN public.book_tests bt ON bt.id = hi.book_test_id
    WHERE bt.section_id = p_section_id
  ) OR EXISTS (
    SELECT 1 FROM public.test_completions tc
    JOIN public.book_tests bt ON bt.id = tc.book_test_id
    WHERE bt.section_id = p_section_id AND tc.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Bu bölümün sayfaları ödevde veya tamamlama kaydında kullanılmış; aralık değiştirilemez';
  END IF;

  DELETE FROM public.book_tests WHERE section_id = p_section_id;

  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
  SELECT v_workspace_id, v_book_id, p_section_id, 'sf. ' || n, n, n, n
  FROM generate_series(p_page_start, p_page_end) AS n;

  UPDATE public.book_sections
  SET page_start = p_page_start, page_end = p_page_end, updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object(
    'section_id', p_section_id,
    'page_count', p_page_end - p_page_start + 1
  );
END;
$fn$;

-- ============================================================
-- 8) Parça RPC'leri (§6.4)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_book_part(
  p_book_id UUID,
  p_title   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_part_id      UUID;
  v_order        INT;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Parça adı boş olamaz';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.book_parts
    WHERE book_id = p_book_id AND lower(btrim(title)) = lower(btrim(p_title))
  ) THEN
    RAISE EXCEPTION 'Bu kaynakta aynı adlı bir parça zaten var';
  END IF;

  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_parts WHERE book_id = p_book_id;

  INSERT INTO public.book_parts (workspace_id, book_id, title, order_index)
  VALUES (v_workspace_id, p_book_id, TRIM(p_title), v_order)
  RETURNING id INTO v_part_id;

  RETURN jsonb_build_object('part_id', v_part_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rename_book_part(
  p_part_id UUID,
  p_title   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_book_id      UUID;
BEGIN
  SELECT workspace_id, book_id INTO v_workspace_id, v_book_id
  FROM public.book_parts WHERE id = p_part_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Parça bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Parça adı boş olamaz';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.book_parts
    WHERE book_id = v_book_id AND id <> p_part_id
      AND lower(btrim(title)) = lower(btrim(p_title))
  ) THEN
    RAISE EXCEPTION 'Bu kaynakta aynı adlı bir parça zaten var';
  END IF;

  -- Parça adı bir ETİKETTİR; ilişki taşımaz. Yeniden adlandırmak hiçbir
  -- bölümü, birimi veya tamamlama kaydını taşımaz (035 ile aynı ilke).
  UPDATE public.book_parts
  SET title = TRIM(p_title), updated_at = NOW()
  WHERE id = p_part_id;

  RETURN jsonb_build_object('part_id', p_part_id);
END;
$fn$;

-- Parça silmek BÖLÜM SİLMEZ: bölümler parçasız kalır ve kaynağın altında
-- görünmeye devam eder. Yanlış kurulmuş bir parça yapısı, ilerleme verisi
-- riske atılmadan geri alınabilmeli.
CREATE OR REPLACE FUNCTION public.delete_book_part(p_part_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_freed        INT;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.book_parts WHERE id = p_part_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Parça bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COUNT(*) INTO v_freed
  FROM public.book_sections WHERE part_id = p_part_id;

  DELETE FROM public.book_parts WHERE id = p_part_id;

  RETURN jsonb_build_object('part_id', p_part_id, 'freed_sections', v_freed);
END;
$fn$;

-- Bölümü bir parçaya taşır. p_part_id NULL ise bölüm parçasız kalır.
CREATE OR REPLACE FUNCTION public.set_section_part(
  p_section_id UUID,
  p_part_id    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_book_id      UUID;
BEGIN
  SELECT workspace_id, book_id INTO v_workspace_id, v_book_id
  FROM public.book_sections WHERE id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Parça bölümle AYNI kitaba ait olmalı; başka kaynağın parçasına
  -- bağlanmak hiyerarşiyi sessizce bozar.
  IF p_part_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.book_parts bp
    WHERE bp.id = p_part_id AND bp.book_id = v_book_id
  ) THEN
    RAISE EXCEPTION 'Parça bu kaynağa ait değil';
  END IF;

  UPDATE public.book_sections
  SET part_id = p_part_id, updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id, 'part_id', p_part_id);
END;
$fn$;

-- ============================================================
-- 9) set_book_classification — Kaynak Türü / Yapısı yazımı
--
-- update_book_metadata (018) imzasını genişletmek yerine ayrı RPC: o
-- fonksiyon 018'den beri sabit ve başka çağrıları var; sınıflama ayrı bir
-- işlemdir ve tek başına da güncellenebilmelidir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_book_classification(
  p_book_id        UUID,
  p_resource_type  TEXT DEFAULT NULL,
  p_structure_kind TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.books
  SET resource_type  = COALESCE(NULLIF(TRIM(COALESCE(p_resource_type, '')), ''), resource_type),
      structure_kind = COALESCE(NULLIF(TRIM(COALESCE(p_structure_kind, '')), ''), structure_kind),
      updated_at     = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id);
END;
$fn$;

-- ============================================================
-- 10) apply_book_parts — oluşturma yolunda Parça kurulumu (§6.4)
--
-- create_book_with_sections_and_tests (022) yüz satırlık bir fonksiyondur ve
-- bölüm/birim üretimini de yapar. 034'ün set_book_curriculum_program için
-- verdiği gerekçe burada da geçerli: gövdesini kopyalamak iki tanımın
-- ayrışması riskini doğurur. Bunun yerine kitap oluşturulduktan SONRA
-- çalışan küçük bir yardımcı.
--
-- p_section_parts = [{"order_index": 1, "part": "F1 Sayılar"}, ...]
--
-- Parçalar ilk görüldükleri sırayla oluşturulur; aynı ad tekrar geçerse
-- mevcut parça kullanılır. Boş/atlanmış girdiler bölümü parçasız bırakır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_book_parts(
  p_book_id       UUID,
  p_section_parts JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_entry        JSONB;
  v_title        TEXT;
  v_order        INT;
  v_part_id      UUID;
  v_next_order   INT;
  v_assigned     INT := 0;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.books WHERE id = p_book_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_section_parts) LOOP
    v_title := NULLIF(TRIM(COALESCE(v_entry->>'part', '')), '');
    v_order := NULLIF(v_entry->>'order_index', '')::INT;

    CONTINUE WHEN v_title IS NULL OR v_order IS NULL;

    SELECT id INTO v_part_id
    FROM public.book_parts
    WHERE book_id = p_book_id AND lower(btrim(title)) = lower(v_title);

    IF v_part_id IS NULL THEN
      SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_order
      FROM public.book_parts WHERE book_id = p_book_id;

      INSERT INTO public.book_parts (workspace_id, book_id, title, order_index)
      VALUES (v_workspace_id, p_book_id, v_title, v_next_order)
      RETURNING id INTO v_part_id;
    END IF;

    UPDATE public.book_sections
    SET part_id = v_part_id, updated_at = NOW()
    WHERE book_id = p_book_id AND order_index = v_order;

    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object('book_id', p_book_id, 'assigned', v_assigned);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.apply_book_parts(UUID, JSONB);
--   DROP FUNCTION IF EXISTS public.set_book_classification(UUID, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.set_section_part(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.delete_book_part(UUID);
--   DROP FUNCTION IF EXISTS public.rename_book_part(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.add_book_part(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.set_section_page_range(UUID, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.set_book_tracking_mode(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.book_has_progress(UUID);
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS part_id;
--   DROP TABLE IF EXISTS public.book_parts;
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_structure_kind_check;
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_resource_type_check;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS structure_kind;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS resource_type;
--   -- tracking_mode ve video_mode CHECK'lerini 013/021'deki dar hallerine
--   -- döndürmeden ÖNCE yeni değer taşıyan kayıt kalmadığını doğrulayın.
--
-- Geri alma kitapları, bölümleri, birimleri, ödevleri ve tamamlama
-- kayıtlarının hiçbirine dokunmaz; yalnız R7 sınıflama ve gruplama
-- katmanını kaldırır.
-- ============================================================
