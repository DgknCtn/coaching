-- ============================================================
-- 021_book_pool_r4  (R4 - Dilim 1: Kitap Havuzu ve kitap meta verisi)
--
-- R4'ün ilk hedefi kitap havuzunu 100+ kaynağı taşıyabilen kalıcı bir
-- kütüphaneye çevirmek:
--
--   1) Kitap meta verisi zenginleşir: seviye/sınav türü (9-12, TYT, AYT,
--      TYT+AYT, LGS, ALES, DGS), baskı yılı ve video desteği alanları.
--   2) Aynı kitabın 2025 / 2026 baskısı AYRI kayıtlar olarak tutulabilir;
--      yeni baskı eklenirken eski kayıt ezilmez (duplicate_book_as_edition).
--   3) Kitap havuzu dönemden ayrılır: books.academic_term_id artık NULL
--      olabilir. Dönem bağı yalnızca öğrenciye atama anında
--      (student_book_assignments.academic_term_id) anlamlıdır.
--
-- Geriye dönük uyum: exam_type kolonu ve 009_books_exam_type_parity'deki
-- CHECK aynen kalır. Yeni UI level_exam yazar; exam_type ondan türetilir
-- (mevcut view'lar, BookCard ve raporlar exam_type okumaya devam ediyor).
-- ============================================================

-- ============================================================
-- 1) books - yeni kolonlar
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS level_exam   TEXT,
  ADD COLUMN IF NOT EXISTS edition_year INTEGER,
  ADD COLUMN IF NOT EXISTS video_mode   TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS video_url    TEXT;

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_level_exam_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_level_exam_check
  CHECK (level_exam IS NULL OR level_exam IN (
    '9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf',
    'TYT', 'AYT', 'TYT+AYT', 'LGS', 'ALES', 'DGS'
  ));

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_edition_year_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_edition_year_check
  CHECK (edition_year IS NULL OR edition_year BETWEEN 2000 AND 2100);

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_video_mode_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_video_mode_check
  CHECK (video_mode IN ('none', 'book', 'section'));

-- Havuz artık dönemden bağımsız. Mevcut satırların academic_term_id'si
-- BİLİNÇLİ olarak olduğu gibi bırakılır; yalnızca zorunluluk kalkar.
ALTER TABLE public.books ALTER COLUMN academic_term_id DROP NOT NULL;

-- Havuz filtreleri için indeksler (arama + ders/seviye/yayın/baskı yılı).
CREATE INDEX IF NOT EXISTS idx_books_pool_filters
  ON public.books (workspace_id, subject, level_exam, edition_year);
CREATE INDEX IF NOT EXISTS idx_books_publisher
  ON public.books (workspace_id, publisher);

-- ============================================================
-- 2) book_sections - insan notu + bölüm videosu
-- ============================================================
ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS note      TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ============================================================
-- 3) exam_type türetici
--
-- level_exam serbest bir seviye/sınav etiketi; exam_type ise 009'daki
-- dar CHECK'e bağlı eski kolon. İki alanı tek yerden eşitleriz ki
-- mevcut ekranlar (BookCard, student_book_progress_view) bozulmasın.
-- ============================================================
CREATE OR REPLACE FUNCTION public.derive_exam_type(p_level_exam TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_level_exam IN ('TYT', 'AYT', 'LGS', 'DGS') THEN p_level_exam
    WHEN p_level_exam = 'TYT+AYT'                     THEN 'TYT'
    WHEN p_level_exam IS NULL                         THEN NULL
    ELSE 'Other'
  END;
$fn$;

-- ============================================================
-- 4) create_book_with_sections_and_tests - R4 alanlarıyla
--
-- 013'teki gövde korunur; eklenenler: level_exam, edition_year,
-- video_mode, video_url ve p_academic_term_id'nin opsiyonelleşmesi.
-- Yeni parametreler DEFAULT'lu olduğu için eski imza ayrı bir overload
-- olarak kalırdı ve isimli çağrı belirsizleşirdi -> önce DROP.
-- ============================================================
DROP FUNCTION IF EXISTS public.create_book_with_sections_and_tests(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT
);

CREATE OR REPLACE FUNCTION public.create_book_with_sections_and_tests(
  p_workspace_id      UUID,
  p_title             TEXT,
  p_subject           TEXT,
  p_academic_term_id  UUID DEFAULT NULL,
  p_publisher         TEXT DEFAULT NULL,
  p_level_exam        TEXT DEFAULT NULL,
  p_edition_year      INTEGER DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_sections          JSONB DEFAULT '[]'::JSONB,
  p_tracking_mode     TEXT DEFAULT 'test',
  p_video_mode        TEXT DEFAULT 'none',
  p_video_url         TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_profile_id    UUID;
  v_book_id       UUID;
  v_section       JSONB;
  v_section_id    UUID;
  v_order         INT;
  v_test_count    INT;
  v_total_tests   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO public.books (
    workspace_id, academic_term_id, title, subject, publisher,
    exam_type, level_exam, edition_year, description,
    tracking_mode, video_mode, video_url, created_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_title, p_subject, p_publisher,
    public.derive_exam_type(p_level_exam), p_level_exam, p_edition_year, p_description,
    p_tracking_mode, COALESCE(p_video_mode, 'none'), p_video_url, v_profile_id
  ) RETURNING id INTO v_book_id;

  v_order := 0;
  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections) LOOP
    v_order := v_order + 1;

    INSERT INTO public.book_sections (workspace_id, book_id, title, order_index, note, video_url)
    VALUES (
      p_workspace_id, v_book_id, v_section->>'title', v_order,
      NULLIF(TRIM(COALESCE(v_section->>'note', '')), ''),
      NULLIF(TRIM(COALESCE(v_section->>'video_url', '')), '')
    )
    RETURNING id INTO v_section_id;

    v_test_count := COALESCE((v_section->>'test_count')::INT, 0);
    v_total_tests := v_total_tests + v_test_count;

    FOR i IN 1..v_test_count LOOP
      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index)
      VALUES (
        p_workspace_id, v_book_id, v_section_id,
        CASE WHEN p_tracking_mode = 'page' THEN i || '. Sayfa Aralığı' ELSE i || '. Test' END,
        i
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'book_id',     v_book_id,
    'total_tests', v_total_tests,
    'sections',    v_order
  );
END;
$fn$;

-- ============================================================
-- 5) update_book_metadata - R4 alanlarıyla
-- 018'deki imza genişliyor; aynı sebeple önce eski imza düşürülüyor.
-- ============================================================
DROP FUNCTION IF EXISTS public.update_book_metadata(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_book_metadata(
  p_book_id      UUID,
  p_title        TEXT,
  p_subject      TEXT,
  p_publisher    TEXT DEFAULT NULL,
  p_level_exam   TEXT DEFAULT NULL,
  p_edition_year INTEGER DEFAULT NULL,
  p_description  TEXT DEFAULT NULL,
  p_video_mode   TEXT DEFAULT 'none',
  p_video_url    TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
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

  IF COALESCE(TRIM(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Ders alanı boş olamaz';
  END IF;

  UPDATE public.books SET
    title        = TRIM(p_title),
    subject      = TRIM(p_subject),
    publisher    = NULLIF(TRIM(COALESCE(p_publisher, '')), ''),
    level_exam   = NULLIF(TRIM(COALESCE(p_level_exam, '')), ''),
    exam_type    = public.derive_exam_type(NULLIF(TRIM(COALESCE(p_level_exam, '')), '')),
    edition_year = p_edition_year,
    description  = NULLIF(TRIM(COALESCE(p_description, '')), ''),
    video_mode   = COALESCE(NULLIF(TRIM(COALESCE(p_video_mode, '')), ''), 'none'),
    video_url    = NULLIF(TRIM(COALESCE(p_video_url, '')), ''),
    updated_at   = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id);
END;
$fn$;

-- ============================================================
-- 6) duplicate_book_as_edition
--
-- "Bu kitabın yeni baskısını oluştur": kitabı bölüm/test yapısıyla
-- kopyalar, yalnızca baskı yılı (ve isteğe bağlı başlık) değişir.
-- Kaynak kayıt DEĞİŞTİRİLMEZ - 2026 içeriği eklenirken 2025 kaydı
-- ezilmemelidir (R4 §8). Öğrenci ilerlemesi kopyalanmaz: yeni baskı
-- boş bir kaynaktır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.duplicate_book_as_edition(
  p_book_id      UUID,
  p_edition_year INTEGER,
  p_title        TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_profile_id   UUID;
  v_src          public.books%ROWTYPE;
  v_new_book_id  UUID;
  v_section      RECORD;
  v_new_section  UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_src.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_edition_year IS NULL THEN
    RAISE EXCEPTION 'Baskı yılı zorunlu';
  END IF;

  IF p_edition_year IS NOT DISTINCT FROM v_src.edition_year THEN
    RAISE EXCEPTION 'Yeni baskı yılı mevcut baskıdan farklı olmalı';
  END IF;

  INSERT INTO public.books (
    workspace_id, academic_term_id, title, subject, publisher,
    exam_type, level_exam, edition_year, description,
    tracking_mode, video_mode, video_url, created_by_profile_id
  ) VALUES (
    v_src.workspace_id, v_src.academic_term_id,
    COALESCE(NULLIF(TRIM(COALESCE(p_title, '')), ''), v_src.title),
    v_src.subject, v_src.publisher,
    v_src.exam_type, v_src.level_exam, p_edition_year, v_src.description,
    v_src.tracking_mode, v_src.video_mode, v_src.video_url, v_profile_id
  ) RETURNING id INTO v_new_book_id;

  FOR v_section IN
    SELECT * FROM public.book_sections
    WHERE book_id = p_book_id AND status = 'active'
    ORDER BY order_index
  LOOP
    INSERT INTO public.book_sections (workspace_id, book_id, title, order_index, note, video_url)
    VALUES (v_src.workspace_id, v_new_book_id, v_section.title, v_section.order_index,
            v_section.note, v_section.video_url)
    RETURNING id INTO v_new_section;

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT v_src.workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';
  END LOOP;

  RETURN jsonb_build_object('book_id', v_new_book_id);
END;
$fn$;
