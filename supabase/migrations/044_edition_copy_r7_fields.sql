-- ============================================================
-- 044_edition_copy_r7_fields  (R6 denetimi — R7 sonrası gerileme düzeltmesi)
--
-- duplicate_book_as_edition 021'de yazıldı ve o günün kolonlarını kopyalıyor.
-- Sonrasında kitap kaydına dört kavram daha eklendi ve fonksiyon hiç
-- güncellenmedi:
--
--   034  books.curriculum_program        (R6-14 öğretim programı)
--   042  books.resource_type             (R7-02 Kaynak Türü)
--   042  books.structure_kind            (R7-02 Kaynak Yapısı)
--   042  book_parts + book_sections.part_id (R7-02 Parça hiyerarşisi)
--   040  book_sections.topic_id          (R5.3 müfredat eşlemesi)
--   043  book_section_topics             (R7-02 çoklu müfredat eşlemesi)
--
-- Ayrıca 022'de eklenen book_sections.page_start / page_end de kopyalanmıyor:
-- sayfa takipli bir kitabın yeni baskısında bölümlerin fiziksel kapsamı
-- boşalıyor, birim satırları kopyalandığı hâlde bölüm "sf. 1-56" bilgisini
-- kaybediyor.
--
-- SONUÇ: 2027 baskısını oluşturan öğretmen sınıflamayı, parça yapısını ve
-- müfredat eşlemelerini sıfırdan kuruyor. Bunlar kitabın YAPISAL bilgisidir
-- (bkz. 040'ın gerekçesi: eşleme öğrenciye değil kitaba aittir), yeni baskıda
-- da geçerlidir.
--
-- DEĞİŞMEYEN: öğrenci ilerlemesi (homework_items, test_completions) yine
-- KOPYALANMAZ. Yeni baskı boş bir kaynaktır; 021'in bu kararı korunur.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu 021'deki gövdeyi geri yükler.
-- ============================================================

CREATE OR REPLACE FUNCTION public.duplicate_book_as_edition(
  p_book_id      UUID,
  p_edition_year INTEGER,
  p_title        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id   UUID;
  v_src          public.books%ROWTYPE;
  v_new_book_id  UUID;
  v_part         RECORD;
  v_section      RECORD;
  v_new_section  UUID;
  v_new_part     UUID;
  -- Eski parça id -> yeni parça id. Bölümler kopyalanırken part_id bu
  -- sözlükten çevrilir; aksi hâlde yeni kitabın bölümleri ESKİ kitabın
  -- parçalarına bağlanır ve iki baskı birbirine karışır.
  v_part_map     JSONB := '{}'::JSONB;
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
    tracking_mode, video_mode, video_url,
    curriculum_program, resource_type, structure_kind,
    created_by_profile_id
  ) VALUES (
    v_src.workspace_id, v_src.academic_term_id,
    COALESCE(NULLIF(TRIM(COALESCE(p_title, '')), ''), v_src.title),
    v_src.subject, v_src.publisher,
    v_src.exam_type, v_src.level_exam, p_edition_year, v_src.description,
    v_src.tracking_mode, v_src.video_mode, v_src.video_url,
    v_src.curriculum_program, v_src.resource_type, v_src.structure_kind,
    v_profile_id
  ) RETURNING id INTO v_new_book_id;

  -- Parçalar bölümlerden ÖNCE kopyalanır: bölüm satırı part_id'yi bilmek
  -- zorunda. Tek parçalı kaynakta bu döngü hiç dönmez.
  FOR v_part IN
    SELECT * FROM public.book_parts
    WHERE book_id = p_book_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.book_parts (workspace_id, book_id, title, order_index)
    VALUES (v_src.workspace_id, v_new_book_id, v_part.title, v_part.order_index)
    RETURNING id INTO v_new_part;

    v_part_map := v_part_map || jsonb_build_object(v_part.id::TEXT, v_new_part::TEXT);
  END LOOP;

  FOR v_section IN
    SELECT * FROM public.book_sections
    WHERE book_id = p_book_id AND status = 'active'
    ORDER BY order_index
  LOOP
    INSERT INTO public.book_sections (
      workspace_id, book_id, title, order_index, note, video_url,
      page_start, page_end, part_id, topic_id,
      group_label, theme_label
    )
    VALUES (
      v_src.workspace_id, v_new_book_id, v_section.title, v_section.order_index,
      v_section.note, v_section.video_url,
      v_section.page_start, v_section.page_end,
      -- Parçasız bölüm parçasız kalır; eşleşme yoksa NULL.
      NULLIF(v_part_map ->> v_section.part_id::TEXT, '')::UUID,
      v_section.topic_id,
      -- R6-17'den kalan eski etiketler: UI'da düzenlenmiyor ama veri
      -- kaybedilmemeli (R7-02 §11).
      v_section.group_label, v_section.theme_label
    )
    RETURNING id INTO v_new_section;

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT v_src.workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';

    -- 043 çoklu müfredat eşlemesi. topic_id yukarıda birincil eşleme olarak
    -- zaten kopyalandı; bu satırlar onun tam listesidir.
    INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
    SELECT v_src.workspace_id, v_new_section, bst.topic_id, bst.sort_order
    FROM public.book_section_topics bst
    WHERE bst.section_id = v_section.id
    ON CONFLICT (section_id, topic_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('book_id', v_new_book_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
-- 021'deki gövdeyi geri yükler: yeni baskı yalnız R4 kolonlarını taşır,
-- parça/müfredat/sayfa kapsamı kopyalanmaz.
--
--   CREATE OR REPLACE FUNCTION public.duplicate_book_as_edition(
--     p_book_id UUID, p_edition_year INTEGER, p_title TEXT DEFAULT NULL
--   ) ... (021_book_pool_r4.sql, bölüm 6)
--
-- Geri alma zaten oluşturulmuş baskıları DEĞİŞTİRMEZ; yalnız bundan sonra
-- oluşturulacak kopyaların kapsamını daraltır.
-- ============================================================
