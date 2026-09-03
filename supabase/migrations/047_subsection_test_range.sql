-- ============================================================
-- 047_subsection_test_range  (R7-03)
--
-- İKİ EKLEME: Alt Bölüm katmanı ve test ARALIĞI.
--
-- ÇIKIŞ NOKTASI (gerçek vaka): 3D TYT Matematik'te 01. Bölüm tek başına
-- ~200 sayfa ve içinde Temel Kavramlar, Üslü Sayılar, Problemler gibi ~30
-- ayrı ödev birimi var. Test numarası bölüm içinde 1-96 ilerliyor ama
-- TÜMEVARIM bloklarında yeniden 1'den başlıyor. "Bölüm + Test Sayısı"
-- modeli bunu temsil edemiyor: öğretmen "Üslü Sayılar Test 44-48" ödevi
-- veremiyor.
--
-- ============================================================
-- NEDEN AYRI TABLO DEĞİL (book_parts kalıbı burada TEKRARLANMADI)
--
-- Parça bir GRUPLAMA katmanıdır ve takip birimi taşımaz (042:96-109).
-- Alt Bölüm ise tam tersi: testlerin GERÇEK sahibidir. Bu yüzden ona
-- bölümün sahip olduğu her şey lazım — topic_id (040), book_section_topics
-- (043), page_start/page_end (022), note, part_id, status. Ayrı tabloda
-- bunların hepsi yeniden yazılırdı.
--
-- Belirleyici olan üçüncü nokta: book_tests üzerindeki
-- UNIQUE (section_id, order_index) kısıtı (001:150). Şartname "aynı basılı
-- test numarası farklı Alt Bölümlerde kullanılabilir, sistem bunu çakışma
-- görmez" diyor. Alt bölüm kendi section_id'si olduğu için TÜMEVARIM I
-- Test 1 ile Temel Kavramlar Test 1 ZATEN ayrı satırlardır — kural
-- bedavaya karşılanıyor. Testler bölümde bırakılıp alt bölüm ayrı tabloya
-- alınsaydı bu kısıtı gevşetmek gerekirdi.
--
-- Sonuç: book_tests.section_id HÂLÂ YAPRAĞI gösterir. homework_items,
-- test_completions, weekly_plan_draft_items ve yüzde/tempo matematiği
-- (lib/plan-scope.ts, lib/plan-pace.ts) HİÇ DEĞİŞMEZ.
-- ============================================================
--
-- İKİ SEVİYE SINIRI: alt bölümün alt bölümü olmaz. Ebeveyn adayının kendi
-- parent_section_id'si NULL olmak zorunda; RPC'ler bunu kontrol eder.
--
-- GERİYE UYUMLULUK: parent_section_id NULL olan bölümler bugünkü gibi
-- davranır ve testlerini doğrudan taşır. Şartnamenin kuralı: "Eski
-- kitapları Alt Bölüm oluşturmaya zorlamayın."
-- ============================================================

-- ------------------------------------------------------------
-- 1) Şema
-- ------------------------------------------------------------
ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS parent_section_id UUID
    REFERENCES public.book_sections(id) ON DELETE CASCADE;

-- Test aralığı — page_start/page_end (022) ile birebir simetrik.
--
-- Bu alanlar YALNIZ BİLGİ DEĞİL, ÜRETİM GİRDİSİDİR: book_tests satırları
-- order_index = n ve title = n || '. Test' olarak bu aralıktan üretilir.
-- Böylece order_index bu kayıtlarda "kitapta yazan test numarası" anlamını
-- kazanır; bugüne kadar hem sıra hem numara olarak çift anlamlıydı
-- (bkz. lib/homework-detail.ts başlığı).
ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS test_start INTEGER,
  ADD COLUMN IF NOT EXISTS test_end   INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'book_sections_test_range_chk'
  ) THEN
    ALTER TABLE public.book_sections
      ADD CONSTRAINT book_sections_test_range_chk
      CHECK (test_end IS NULL OR test_start IS NULL OR test_end >= test_start);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_book_sections_parent
  ON public.book_sections (parent_section_id)
  WHERE parent_section_id IS NOT NULL;

COMMENT ON COLUMN public.book_sections.parent_section_id IS
  'R7-03: dolu ise bu satır bir Alt Bölümdür ve testlerin sahibidir; ebeveyn satır testsiz kapsayıcıdır.';
COMMENT ON COLUMN public.book_sections.test_start IS
  'R7-03: kitapta yazan ilk test numarası. book_tests.order_index bu aralıktan üretilir.';

-- ------------------------------------------------------------
-- 2) add_book_subsection
--
-- Alt bölüm satırını açar ve test aralığından birim satırlarını üretir.
-- add_book_part (042:342) + create_page_section (022:48) karışımı.
-- ------------------------------------------------------------
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
  v_order        INT;
  v_new_id       UUID;
BEGIN
  SELECT workspace_id, book_id, parent_section_id
    INTO v_workspace_id, v_book_id, v_parent
  FROM public.book_sections WHERE id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
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
  -- bölümlerde tekrar etmesine açıkça izin veriyor (TÜMEVARIM I Test 1-4
  -- ile Temel Kavramlar Test 1-4 aynı kitapta birlikte durur).

  -- Bölümün doğrudan testleri varsa alt bölüme geçilemez: aynı bölümde iki
  -- ayrı üretim yolu iki doğruluk kaynağı demektir. Önce eski testler
  -- temizlenmeli (arayüz bunu söyler).
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

-- ------------------------------------------------------------
-- 3) rename_book_subsection
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_book_subsection(
  p_subsection_id UUID,
  p_title         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_parent       UUID;
BEGIN
  SELECT workspace_id, parent_section_id INTO v_workspace_id, v_parent
  FROM public.book_sections WHERE id = p_subsection_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Alt bölüm bulunamadı'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Bu kayıt bir alt bölüm değil'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Alt bölüm adı boş olamaz';
  END IF;

  UPDATE public.book_sections
  SET title = TRIM(p_title), updated_at = NOW()
  WHERE id = p_subsection_id;

  RETURN jsonb_build_object('subsection_id', p_subsection_id);
END;
$fn$;

-- ------------------------------------------------------------
-- 4) set_subsection_test_range
--
-- set_section_page_range (042:271) deseni: SİL + YENİDEN ÜRET, ilerleme
-- varsa reddet. Numaralar değiştiği için satırları güncellemek yerine
-- yeniden kurmak tek tutarlı yol.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_subsection_test_range(
  p_subsection_id UUID,
  p_test_start    INTEGER,
  p_test_end      INTEGER
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
BEGIN
  SELECT workspace_id, book_id, parent_section_id
    INTO v_workspace_id, v_book_id, v_parent
  FROM public.book_sections WHERE id = p_subsection_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Alt bölüm bulunamadı'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Bu kayıt bir alt bölüm değil'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_test_start IS NULL OR p_test_end IS NULL
     OR p_test_start < 1 OR p_test_end < p_test_start THEN
    RAISE EXCEPTION 'Geçerli bir test aralığı girin';
  END IF;

  IF (p_test_end - p_test_start + 1) > 200 THEN
    RAISE EXCEPTION 'Bir alt bölüm en fazla 200 test içerebilir';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    JOIN public.book_tests bt ON bt.id = hi.book_test_id
    WHERE bt.section_id = p_subsection_id
  ) OR EXISTS (
    SELECT 1 FROM public.test_completions tc
    JOIN public.book_tests bt ON bt.id = tc.book_test_id
    WHERE bt.section_id = p_subsection_id AND tc.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Bu alt bölümün testleri ödevde veya tamamlama kaydında kullanılmış; aralık değiştirilemez';
  END IF;

  DELETE FROM public.book_tests WHERE section_id = p_subsection_id;

  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
  SELECT v_workspace_id, v_book_id, p_subsection_id, n || '. Test', n
  FROM generate_series(p_test_start, p_test_end) AS n;

  UPDATE public.book_sections
  SET test_start = p_test_start, test_end = p_test_end, updated_at = NOW()
  WHERE id = p_subsection_id;

  RETURN jsonb_build_object(
    'subsection_id', p_subsection_id,
    'test_count', p_test_end - p_test_start + 1
  );
END;
$fn$;

-- ------------------------------------------------------------
-- 5) delete_book_subsection
--
-- Testler CASCADE ile gider. delete_book_part'ın aksine burada gerçek bir
-- silme yapılır: parça silindiğinde bölümler serbest kalıyordu, alt bölüm
-- silindiğinde ise testlerinin sahibi kalmaz.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_book_subsection(p_subsection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_parent       UUID;
BEGIN
  SELECT workspace_id, parent_section_id INTO v_workspace_id, v_parent
  FROM public.book_sections WHERE id = p_subsection_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Alt bölüm bulunamadı'; END IF;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Bu kayıt bir alt bölüm değil'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.homework_items hi
    JOIN public.book_tests bt ON bt.id = hi.book_test_id
    WHERE bt.section_id = p_subsection_id
  ) THEN
    RAISE EXCEPTION 'Bu alt bölümün testleri ödevde kullanılmış; silinemez';
  END IF;

  DELETE FROM public.book_sections WHERE id = p_subsection_id;

  RETURN jsonb_build_object('deleted', p_subsection_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.add_book_subsection(UUID, TEXT, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.rename_book_subsection(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.set_subsection_test_range(UUID, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.delete_book_subsection(UUID);
--   DROP INDEX IF EXISTS public.idx_book_sections_parent;
--   ALTER TABLE public.book_sections DROP CONSTRAINT IF EXISTS book_sections_test_range_chk;
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS parent_section_id;  -- alt bölümleri CASCADE ile siler
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS test_start, DROP COLUMN IF EXISTS test_end;
--
-- DİKKAT: parent_section_id kolonunu düşürmek alt bölüm SATIRLARINI
-- silmez ama onları normal bölüm hâline getirir; kitap yapısı düzleşir.
-- Alt bölüm kullanılmaya başlandıysa geri alma veri kaybı sayılmalıdır.
-- ============================================================
