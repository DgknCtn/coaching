-- ============================================================
-- 034_curriculum_program  (R6-14 + R6-16)
--
-- R6-14: Geçiş döneminde eski sınav kaynakları ile Türkiye Yüzyılı Maarif
-- Modeli kaynaklarını VERİ DÜZEYİNDE ayırt etmek gerekiyor. Kitap bugün
-- seviye/sınav bilgisini taşıyor ama hangi ÖĞRETİM PROGRAMINA göre
-- üretildiğini taşımıyor.
--
-- R6-16: '9. Sınıf' olarak oluşturulan kitaplar bazı ekranlarda 'Other'
-- görünüyor. Kök neden 021'deki derive_exam_type: level_exam'ı dar
-- exam_type kümesine indirirken sınıf seviyelerini 'Other'a düşürüyor.
-- Bu bir RENDER hatasıdır — level_exam DOĞRU kayıtlı. Bu yüzden VERİ
-- MIGRATION'I YAPILMAZ; düzeltme ekranların level_exam okumasıyla
-- (uygulama katmanı) ve derive_exam_type'ın yeni değerleri tanımasıyla
-- sınırlıdır.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) books.curriculum_program
--
-- Mevcut kitaplar 'Belirtilmedi' alır. Veri ZORLA TAHMİN EDİLMEZ: bir
-- kitabın hangi programa göre yazıldığını başlığından çıkarmak güvenilir
-- değil ve yanlış tahmin, filtreleri sessizce bozardı (kabul #78).
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS curriculum_program TEXT NOT NULL DEFAULT 'Belirtilmedi';

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_curriculum_program_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_curriculum_program_check
  CHECK (curriculum_program IN (
    'Belirtilmedi',
    'Türkiye Yüzyılı Maarif Modeli',
    '2018 MEB Programı'
  ));

CREATE INDEX IF NOT EXISTS idx_books_curriculum_program
  ON public.books (workspace_id, curriculum_program);

-- ============================================================
-- 2) level_exam: 1. Aşama / 2. Aşama
--
-- KRİTİK: '1. Aşama' ile 'TYT' AYNI DEĞER DEĞİLDİR ve birbirine
-- eşlenmemelidir. Geçiş yıllarında ikisi bir arada var olacak; filtrede
-- TYT seçmek 1. Aşama kaynaklarını GETİRMEMELİ (kabul #77).
-- ============================================================
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_level_exam_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_level_exam_check
  CHECK (level_exam IS NULL OR level_exam IN (
    '9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf',
    'TYT', 'AYT', 'TYT+AYT', 'LGS', 'ALES', 'DGS',
    -- R6-14 (TYMM geçişi)
    '1. Aşama', '2. Aşama'
  ));

-- ============================================================
-- 3) derive_exam_type — R6-16
--
-- Eski dar exam_type kolonu hâlâ bazı view'lar tarafından okunuyor, bu
-- yüzden türetici korunur. DEĞİŞEN: yeni değerler 'Other'a düşmesin diye
-- 1. Aşama / 2. Aşama açıkça eşlenir.
--
-- Sınıf seviyeleri (9-12) hâlâ 'Other' üretir ve bu DOĞRUDUR: exam_type
-- bir SINAV alanıdır, sınıf seviyesi taşıyamaz. Ekranların çözümü bu
-- fonksiyonu değiştirmek değil, level_exam'ı okumaktır — R6-16'nın
-- uygulama tarafındaki düzeltmesi tam olarak budur.
-- ============================================================
CREATE OR REPLACE FUNCTION public.derive_exam_type(p_level_exam TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN p_level_exam IN ('TYT', 'AYT', 'LGS', 'DGS') THEN p_level_exam
    WHEN p_level_exam = 'TYT+AYT'                     THEN 'TYT'
    -- Geçiş dönemi: aşamalar sınav niteliğindedir ama TYT/AYT'ye
    -- EŞLENMEZ; eski dar CHECK'i ihlal etmemek için 'Other' kalırlar ve
    -- gerçek ayrım level_exam üzerinden yapılır.
    WHEN p_level_exam IN ('1. Aşama', '2. Aşama')     THEN 'Other'
    WHEN p_level_exam IS NULL                         THEN NULL
    ELSE 'Other'
  END;
$fn$;

-- ============================================================
-- 4) update_book_metadata — curriculum_program
--
-- 021'deki imza genişliyor; 021'in kendi yaptığı gibi önce eski imza
-- düşürülür (Postgres varsayılan değeri değişen imzayı REPLACE edemez).
--
-- Gövde 021'deki ile birebir aynıdır; TEK fark curriculum_program alanının
-- yazılması. NULL gönderildiğinde mevcut değer KORUNUR — bu alanı henüz
-- göndermeyen bir çağrı kitabın programını sessizce sıfırlamasın.
-- ============================================================
DROP FUNCTION IF EXISTS public.update_book_metadata(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_book_metadata(
  p_book_id            UUID,
  p_title              TEXT,
  p_subject            TEXT,
  p_publisher          TEXT DEFAULT NULL,
  p_level_exam         TEXT DEFAULT NULL,
  p_edition_year       INTEGER DEFAULT NULL,
  p_description        TEXT DEFAULT NULL,
  p_video_mode         TEXT DEFAULT 'none',
  p_video_url          TEXT DEFAULT NULL,
  p_curriculum_program TEXT DEFAULT NULL
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

  IF COALESCE(TRIM(p_title), '') = '' THEN
    RAISE EXCEPTION 'Kitap adı boş olamaz';
  END IF;

  IF COALESCE(TRIM(p_subject), '') = '' THEN
    RAISE EXCEPTION 'Ders alanı boş olamaz';
  END IF;

  IF p_curriculum_program IS NOT NULL AND p_curriculum_program NOT IN (
    'Belirtilmedi', 'Türkiye Yüzyılı Maarif Modeli', '2018 MEB Programı'
  ) THEN
    RAISE EXCEPTION 'Geçersiz öğretim programı';
  END IF;

  UPDATE public.books SET
    title              = TRIM(p_title),
    subject            = TRIM(p_subject),
    publisher          = NULLIF(TRIM(COALESCE(p_publisher, '')), ''),
    level_exam         = NULLIF(TRIM(COALESCE(p_level_exam, '')), ''),
    exam_type          = public.derive_exam_type(NULLIF(TRIM(COALESCE(p_level_exam, '')), '')),
    edition_year       = p_edition_year,
    description        = NULLIF(TRIM(COALESCE(p_description, '')), ''),
    video_mode         = COALESCE(NULLIF(TRIM(COALESCE(p_video_mode, '')), ''), 'none'),
    video_url          = NULLIF(TRIM(COALESCE(p_video_url, '')), ''),
    curriculum_program = COALESCE(p_curriculum_program, curriculum_program),
    updated_at         = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id);
END;
$fn$;

-- ============================================================
-- 5) set_book_curriculum_program
--
-- Kitap OLUŞTURMA yolu (create_book_with_sections_and_tests) yüz satırlık
-- bir fonksiyon ve bölüm/test üretimini de yapıyor. Ona tek bir alan
-- eklemek için gövdesinin tamamını bu migration'a kopyalamak, ileride iki
-- tanımın ayrışması riskini doğururdu.
--
-- Bunun yerine küçük ve tek işli bir yardımcı: kitap oluşturulduktan sonra
-- programı yazar. Kolonun DEFAULT'u 'Belirtilmedi' olduğu için bu çağrı
-- yapılmasa da kitap tutarlı kalır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_book_curriculum_program(
  p_book_id            UUID,
  p_curriculum_program TEXT
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

  IF p_curriculum_program IS NOT NULL AND p_curriculum_program NOT IN (
    'Belirtilmedi', 'Türkiye Yüzyılı Maarif Modeli', '2018 MEB Programı'
  ) THEN
    RAISE EXCEPTION 'Geçersiz öğretim programı';
  END IF;

  UPDATE public.books
  SET curriculum_program = COALESCE(p_curriculum_program, curriculum_program),
      updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_book_curriculum_program(UUID, TEXT);
--   -- update_book_metadata için 021_book_pool_r4.sql'deki tanımı yeniden
--   -- çalıştırın (önce 034'teki 10 parametreli imzayı DROP ederek).
--
--   -- 1. Aşama / 2. Aşama ile kayıtlı kitap var mı?
--   SELECT id, title, level_exam FROM public.books
--   WHERE level_exam IN ('1. Aşama', '2. Aşama');
--   -- Varsa önce NULL'a çekin, sonra:
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_level_exam_check;
--   ALTER TABLE public.books
--     ADD CONSTRAINT books_level_exam_check
--     CHECK (level_exam IS NULL OR level_exam IN (
--       '9. Sınıf','10. Sınıf','11. Sınıf','12. Sınıf',
--       'TYT','AYT','TYT+AYT','LGS','ALES','DGS'));
--
--   DROP INDEX IF EXISTS public.idx_books_curriculum_program;
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_curriculum_program_check;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS curriculum_program;
--
--   -- derive_exam_type için 021_book_pool_r4.sql'deki tanımı yeniden çalıştırın.
-- ============================================================
