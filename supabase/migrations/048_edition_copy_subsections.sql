-- ============================================================
-- 048_edition_copy_subsections  (R7-03 devamı)
--
-- duplicate_book_as_edition, 047'de eklenen Alt Bölüm katmanını ve test
-- aralığını da kopyalar.
--
-- NEDEN AYRI MIGRATION DEĞİL DE HEMEN ŞİMDİ: 044'ün kendisi bu
-- fonksiyonun her yapısal eklemede güncellenmesi UNUTULDUĞUNDA ne
-- olduğunun kayıtlı örneğidir — 021'den beri güncellenmemiş, öğretim
-- programı, kaynak türü, parça hiyerarşisi ve müfredat eşlemeleri yeni
-- baskıda sessizce kaybolmuştu. Aynı hata R7-03'te tekrarlanmıyor.
--
-- DEĞİŞEN TEK ŞEY: bölüm kopyalama artık İKİ GEÇİŞLİDİR.
--
--   1. geçiş — üst düzey bölümler (parent_section_id IS NULL)
--   2. geçiş — alt bölümler, v_section_map ile yeni ebeveyne bağlanır
--
-- Tek geçişte kopyalansaydı alt bölümün ebeveyni henüz var olmayabilir ya
-- da ESKİ kitabın bölümüne bağlanabilirdi; iki baskı birbirine karışırdı.
-- 044'teki v_part_map ile aynı gerekçe.
--
-- DEĞİŞMEYEN: öğrenci ilerlemesi (homework_items, test_completions) yine
-- KOPYALANMAZ. Yeni baskı boş bir kaynaktır; 021'in bu kararı korunur.
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
  v_part_map     JSONB := '{}'::JSONB;
  -- Eski bölüm id -> yeni bölüm id. Alt bölümler ebeveynlerini buradan
  -- bulur; aksi hâlde yeni kitabın alt bölümleri ESKİ kitabın bölümlerine
  -- bağlanırdı.
  v_section_map  JSONB := '{}'::JSONB;
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

  -- Parçalar bölümlerden ÖNCE: bölüm satırı part_id'yi bilmek zorunda.
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

  -- ============================================================
  -- 1. GEÇİŞ: üst düzey bölümler
  -- ============================================================
  FOR v_section IN
    SELECT * FROM public.book_sections
    WHERE book_id = p_book_id AND status = 'active' AND parent_section_id IS NULL
    ORDER BY order_index
  LOOP
    INSERT INTO public.book_sections (
      workspace_id, book_id, title, order_index, note, video_url,
      page_start, page_end, part_id, topic_id,
      group_label, theme_label, test_start, test_end
    )
    VALUES (
      v_src.workspace_id, v_new_book_id, v_section.title, v_section.order_index,
      v_section.note, v_section.video_url,
      v_section.page_start, v_section.page_end,
      NULLIF(v_part_map ->> v_section.part_id::TEXT, '')::UUID,
      v_section.topic_id,
      v_section.group_label, v_section.theme_label,
      v_section.test_start, v_section.test_end
    )
    RETURNING id INTO v_new_section;

    v_section_map := v_section_map || jsonb_build_object(v_section.id::TEXT, v_new_section::TEXT);

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT v_src.workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';

    INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
    SELECT v_src.workspace_id, v_new_section, bst.topic_id, bst.sort_order
    FROM public.book_section_topics bst
    WHERE bst.section_id = v_section.id
    ON CONFLICT (section_id, topic_id) DO NOTHING;
  END LOOP;

  -- ============================================================
  -- 2. GEÇİŞ: alt bölümler (R7-03)
  --
  -- Ebeveyni bu kitapta bulunamayan (ör. arşivlenmiş) alt bölüm ATLANIR:
  -- sahipsiz bir alt bölüm yeni baskıda yetim satır olurdu.
  -- ============================================================
  FOR v_section IN
    SELECT * FROM public.book_sections
    WHERE book_id = p_book_id AND status = 'active' AND parent_section_id IS NOT NULL
    ORDER BY order_index
  LOOP
    IF (v_section_map ->> v_section.parent_section_id::TEXT) IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.book_sections (
      workspace_id, book_id, title, order_index, note, video_url,
      page_start, page_end, part_id, topic_id,
      group_label, theme_label, test_start, test_end, parent_section_id
    )
    VALUES (
      v_src.workspace_id, v_new_book_id, v_section.title, v_section.order_index,
      v_section.note, v_section.video_url,
      v_section.page_start, v_section.page_end,
      NULLIF(v_part_map ->> v_section.part_id::TEXT, '')::UUID,
      v_section.topic_id,
      v_section.group_label, v_section.theme_label,
      v_section.test_start, v_section.test_end,
      (v_section_map ->> v_section.parent_section_id::TEXT)::UUID
    )
    RETURNING id INTO v_new_section;

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT v_src.workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';

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
-- 044'teki gövdeyi geri yükler: yeni baskı alt bölümleri ve test
-- aralıklarını taşımaz, bölümler tek geçişte kopyalanır.
--
-- Geri alma zaten oluşturulmuş baskıları DEĞİŞTİRMEZ.
-- ============================================================
