-- ============================================================
-- 069_book_library  (Merkezi Kaynak Kütüphanesi)
--
-- SORUN: yeni bir koç üye olduğunda kitap havuzu bomboştur. Kullanabildiği
-- tek yol /teacher/books/new formudur ve 3D TYT gibi bir kaynak ~60 alt
-- bölüm demek. lib/book-import.ts başlığındaki tespit hâlâ geçerli: ilk
-- kurulumun yarım kalmasının bir numaralı sebebi bu.
--
-- ÇÖZÜM: platformun önceden hazırladığı ORTAK bir kaynak kütüphanesi. Koç
-- kütüphaneden ders/yayın/seviye/tür filtreleriyle arar, çoklu seçimle
-- kendi havuzuna KOPYALAR. Kendi kurduğu bir kaynağı kütüphaneye önerebilir;
-- platform yöneticisi onaylayınca herkese açılır.
--
-- NEDEN YENİ TABLO DEĞİL: kütüphane kitabı sıradan bir `books` satırıdır,
-- yalnız `is_library` bayraklı özel bir çalışma alanında durur. Böylece
-- kitap formu, düzenleme ekranı, toplu içe aktarma, yedekleme — hepsi
-- kütüphaneyi doldurmak için OLDUĞU GİBİ çalışır. Paralel bir
-- library_books şeması, her yapı değişikliğinde iki yerde bakım demekti.
--
-- KOPYA, BAĞ DEĞİL: koçun havuzuna giren kitap bağımsız bir kayıttır.
-- Kütüphanedeki kaynak sonradan değişse bile koçun öğrencisinin ilerlemesi
-- ayağının altından kaymaz. `library_source_book_id` yalnız İZDİR: "bu
-- kitap zaten havuzunda" kontrolü ve ileride "kaynağın yeni baskısı var"
-- bildirimi bunun üzerinden yapılır.
--
-- KONU (topic) EŞLEMELERİ ÇALIŞMA ALANLARI ARASINDA KOPYALANMAZ: `topics`
-- workspace'e bağlıdır (038) ve 043 açıkça "her topic kitapla aynı
-- workspace'te olmalıdır" der. Başka bir alanın topic id'sini taşımak
-- yabancı bir müfredat satırına bağ kurmak olurdu. Alanlar arası kopyada
-- bölümün `topic_id`'si NULL bırakılır ve `book_section_topics` satırları
-- atlanır; AYNI alan içindeki kopyada (yeni baskı) eskisi gibi taşınır.
--
-- ÖĞRENCİ İLERLEMESİ KOPYALANMAZ: 021'in kararı korunur.
-- ============================================================


-- ============================================================
-- 1) Kütüphane çalışma alanı bayrağı
-- ============================================================
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS is_library BOOLEAN NOT NULL DEFAULT FALSE;

-- Tek kütüphane. İkinci bir "kütüphane" alanı açılırsa koç hangisini
-- gördüğünü bilemez; kısıt veritabanında durur, uygulama diline emanet
-- edilmez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_single_library
  ON public.workspaces (is_library) WHERE is_library;


-- ============================================================
-- 2) books: kaynak izi ve kütüphane durumu
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS library_source_book_id UUID
    REFERENCES public.books(id) ON DELETE SET NULL;

-- 'none'     — sıradan bir havuz kitabı (varsayılan)
-- 'pending'  — koç kütüphaneye önerdi, admin kararı bekliyor
-- 'approved' — kütüphanede yayında
-- 'rejected' — öneri reddedildi; kitap koçun havuzunda kalır
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS library_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_library_status_check;
ALTER TABLE public.books
  ADD CONSTRAINT books_library_status_check
  CHECK (library_status IN ('none', 'pending', 'approved', 'rejected'));

-- Reddetme gerekçesi: koç kitabını neden geri çevirdiğimizi görmeden
-- düzeltemez.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS library_review_note TEXT;

-- "Bu kütüphane kitabı havuzumda var mı?" sorgusu koçun her kütüphane
-- ziyaretinde çalışır.
CREATE INDEX IF NOT EXISTS idx_books_library_source
  ON public.books (workspace_id, library_source_book_id)
  WHERE library_source_book_id IS NOT NULL;

-- Admin'in bekleyen öneri listesi.
CREATE INDEX IF NOT EXISTS idx_books_library_pending
  ON public.books (library_status, created_at DESC)
  WHERE library_status = 'pending';


-- ============================================================
-- 3) Kütüphane okuma izni
--
-- Herhangi bir çalışma alanında owner/teacher olan kullanıcı, kütüphane
-- alanındaki YAYINDAKİ kitapları okuyabilir. Yazma hakkı VERİLMEZ: write
-- politikaları workspace üyeliği arar ve hiçbir koç kütüphane alanının
-- üyesi değildir. Kütüphaneye yazan tek yol is_platform_admin() kontrollü
-- RPC'lerdir.
--
-- Öğrenci ve veli kütüphaneyi GÖRMEZ: onlar kaynağı havuzdan atanmış
-- hâliyle görür, ham kütüphaneyi gezmeleri için sebep yok.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_library_workspace(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (SELECT is_library FROM public.workspaces WHERE id = p_workspace_id),
    FALSE
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.is_library_workspace(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_library()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.profiles p ON p.id = wm.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND wm.status = 'active'
      AND wm.role IN ('owner', 'teacher')
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.can_read_library() TO authenticated;

-- Kütüphane alanının id'si. Koç bu alanın ÜYESİ DEĞİLDİR, dolayısıyla
-- workspaces satırını RLS ile okuyamaz; id'yi öğrenmenin tek yolu budur.
-- Dönen tek şey bir id: kütüphaneyi okuma hakkı yine books politikasında
-- denetlenir.
CREATE OR REPLACE FUNCTION public.library_workspace_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT id FROM public.workspaces WHERE is_library LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.library_workspace_id() TO authenticated;

DROP POLICY IF EXISTS "books_select" ON public.books;
CREATE POLICY "books_select" ON public.books
  FOR SELECT USING (
    (SELECT public.has_workspace_role(books.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = books.id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
    -- 069: kütüphane kolu
    OR (
      books.status = 'active'
      AND books.library_status = 'approved'
      AND (SELECT public.is_library_workspace(books.workspace_id))
      AND (SELECT public.can_read_library())
    )
  );

DROP POLICY IF EXISTS "sections_select" ON public.book_sections;
CREATE POLICY "sections_select" ON public.book_sections
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_sections.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_sections.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
    OR (
      (SELECT public.is_library_workspace(book_sections.workspace_id))
      AND (SELECT public.can_read_library())
      AND EXISTS (
        SELECT 1 FROM public.books b
        WHERE b.id = book_sections.book_id
          AND b.status = 'active' AND b.library_status = 'approved'
      )
    )
  );

DROP POLICY IF EXISTS "tests_select" ON public.book_tests;
CREATE POLICY "tests_select" ON public.book_tests
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_tests.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_tests.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
    OR (
      (SELECT public.is_library_workspace(book_tests.workspace_id))
      AND (SELECT public.can_read_library())
      AND EXISTS (
        SELECT 1 FROM public.books b
        WHERE b.id = book_tests.book_id
          AND b.status = 'active' AND b.library_status = 'approved'
      )
    )
  );

DROP POLICY IF EXISTS book_parts_select ON public.book_parts;
CREATE POLICY book_parts_select ON public.book_parts
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_parts.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_parts.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
    OR (
      (SELECT public.is_library_workspace(book_parts.workspace_id))
      AND (SELECT public.can_read_library())
      AND EXISTS (
        SELECT 1 FROM public.books b
        WHERE b.id = book_parts.book_id
          AND b.status = 'active' AND b.library_status = 'approved'
      )
    )
  );


-- ============================================================
-- 4) _copy_book_tree — TEK derin kopya gövdesi
--
-- 048'in başlığı, kopyalama mantığının yapı değişikliklerinde
-- güncellenmesinin UNUTULMASININ neye mal olduğunu kayda geçirmişti:
-- duplicate_book_as_edition 021'den 044'e kadar sessizce öğretim programı,
-- kaynak türü ve parça hiyerarşisini düşürüyordu. Aynı hatanın üçüncü
-- kopyasını üretmemek için gövde buraya, tek bir yere taşınıyor;
-- duplicate_book_as_edition da artık bunu çağırıyor.
--
-- Yeni bir yapı katmanı eklendiğinde güncellenecek TEK yer burasıdır.
--
-- p_target_workspace_id kaynağınkinden FARKLIYSA bu bir kütüphane
-- kopyasıdır: topic bağları düşürülür (yukarıdaki gerekçe).
-- ============================================================
CREATE OR REPLACE FUNCTION public._copy_book_tree(
  p_book_id             UUID,
  p_target_workspace_id UUID,
  p_term_id             UUID    DEFAULT NULL,
  p_title               TEXT    DEFAULT NULL,
  p_edition_year        INTEGER DEFAULT NULL,
  p_library_source      UUID    DEFAULT NULL,
  p_library_status      TEXT    DEFAULT 'none'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src          public.books%ROWTYPE;
  v_new_book_id  UUID;
  v_cross        BOOLEAN;
  v_part         RECORD;
  v_section      RECORD;
  v_new_section  UUID;
  v_new_part     UUID;
  v_part_map     JSONB := '{}'::JSONB;
  v_section_map  JSONB := '{}'::JSONB;
BEGIN
  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  v_cross := v_src.workspace_id IS DISTINCT FROM p_target_workspace_id;

  INSERT INTO public.books (
    workspace_id, academic_term_id, title, subject, publisher,
    exam_type, level_exam, edition_year, description,
    tracking_mode, video_mode, video_url,
    curriculum_program, resource_type, structure_kind,
    created_by_profile_id, library_source_book_id, library_status
  ) VALUES (
    p_target_workspace_id,
    p_term_id,
    COALESCE(NULLIF(TRIM(COALESCE(p_title, '')), ''), v_src.title),
    v_src.subject, v_src.publisher,
    v_src.exam_type, v_src.level_exam,
    COALESCE(p_edition_year, v_src.edition_year),
    v_src.description,
    v_src.tracking_mode, v_src.video_mode, v_src.video_url,
    v_src.curriculum_program, v_src.resource_type, v_src.structure_kind,
    public.current_profile_id(), p_library_source, p_library_status
  ) RETURNING id INTO v_new_book_id;

  -- Parçalar bölümlerden ÖNCE: bölüm satırı part_id'yi bilmek zorunda.
  FOR v_part IN
    SELECT * FROM public.book_parts
    WHERE book_id = p_book_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.book_parts (workspace_id, book_id, title, order_index)
    VALUES (p_target_workspace_id, v_new_book_id, v_part.title, v_part.order_index)
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
      p_target_workspace_id, v_new_book_id, v_section.title, v_section.order_index,
      v_section.note, v_section.video_url,
      v_section.page_start, v_section.page_end,
      NULLIF(v_part_map ->> v_section.part_id::TEXT, '')::UUID,
      CASE WHEN v_cross THEN NULL ELSE v_section.topic_id END,
      v_section.group_label, v_section.theme_label,
      v_section.test_start, v_section.test_end
    )
    RETURNING id INTO v_new_section;

    v_section_map := v_section_map || jsonb_build_object(v_section.id::TEXT, v_new_section::TEXT);

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT p_target_workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';

    IF NOT v_cross THEN
      INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
      SELECT p_target_workspace_id, v_new_section, bst.topic_id, bst.sort_order
      FROM public.book_section_topics bst
      WHERE bst.section_id = v_section.id
      ON CONFLICT (section_id, topic_id) DO NOTHING;
    END IF;
  END LOOP;

  -- ============================================================
  -- 2. GEÇİŞ: alt bölümler
  --
  -- Ebeveyni bu kitapta bulunamayan (ör. arşivlenmiş) alt bölüm ATLANIR:
  -- sahipsiz bir alt bölüm kopyada yetim satır olurdu.
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
      p_target_workspace_id, v_new_book_id, v_section.title, v_section.order_index,
      v_section.note, v_section.video_url,
      v_section.page_start, v_section.page_end,
      NULLIF(v_part_map ->> v_section.part_id::TEXT, '')::UUID,
      CASE WHEN v_cross THEN NULL ELSE v_section.topic_id END,
      v_section.group_label, v_section.theme_label,
      v_section.test_start, v_section.test_end,
      (v_section_map ->> v_section.parent_section_id::TEXT)::UUID
    )
    RETURNING id INTO v_new_section;

    INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
    SELECT p_target_workspace_id, v_new_book_id, v_new_section, bt.title, bt.order_index, bt.page_start, bt.page_end
    FROM public.book_tests bt
    WHERE bt.section_id = v_section.id AND bt.status = 'active';

    IF NOT v_cross THEN
      INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
      SELECT p_target_workspace_id, v_new_section, bst.topic_id, bst.sort_order
      FROM public.book_section_topics bst
      WHERE bst.section_id = v_section.id
      ON CONFLICT (section_id, topic_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_new_book_id;
END;
$fn$;

-- _copy_book_tree YETKİ KONTROLÜ YAPMAZ; iç yardımcıdır ve yalnız
-- kontrolünü kendisi yapan RPC'lerden çağrılır. Bu yüzden authenticated
-- role'e EXECUTE verilmez.
REVOKE ALL ON FUNCTION public._copy_book_tree(UUID, UUID, UUID, TEXT, INTEGER, UUID, TEXT) FROM PUBLIC;


-- ============================================================
-- 5) duplicate_book_as_edition — artık ortak gövdeyi çağırıyor
--
-- Dışarıdan görünen davranış AYNI: aynı çalışma alanında, verilen baskı
-- yılıyla yeni bir kaynak. Tek fark kopyalamayı kendisinin yapmaması.
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
  v_src         public.books%ROWTYPE;
  v_new_book_id UUID;
BEGIN
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

  v_new_book_id := public._copy_book_tree(
    p_book_id             => p_book_id,
    p_target_workspace_id => v_src.workspace_id,
    p_term_id             => v_src.academic_term_id,
    p_title               => p_title,
    p_edition_year        => p_edition_year,
    p_library_source      => v_src.library_source_book_id,
    p_library_status      => 'none'
  );

  RETURN jsonb_build_object('book_id', v_new_book_id);
END;
$fn$;


-- ============================================================
-- 6) copy_library_books — kütüphaneden havuza çoklu kopya
--
-- ATLAMA, HATA DEĞİL: koç 12 kitap seçtiyse ve ikisi zaten havuzundaysa
-- işlemin tamamını geri almak ona hiçbir şey kazandırmaz. Atlananlar
-- sayılır ve arayüzde söylenir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.copy_library_books(
  p_workspace_id UUID,
  p_book_ids     UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_book_id  UUID;
  v_src      public.books%ROWTYPE;
  v_copied   INTEGER := 0;
  v_skipped  INTEGER := 0;
  v_new_ids  UUID[] := ARRAY[]::UUID[];
  v_new_id   UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_book_ids IS NULL OR array_length(p_book_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Kitap seçilmedi';
  END IF;

  -- Tek istekte havuza yazılacak kayıt sayısı sınırlıdır; 50 kitap zaten
  -- binlerce test satırı demek.
  IF array_length(p_book_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 50 kitap eklenebilir';
  END IF;

  FOREACH v_book_id IN ARRAY p_book_ids LOOP
    SELECT * INTO v_src FROM public.books WHERE id = v_book_id;

    -- Kaynak gerçekten kütüphanede ve yayında mı? Bu kontrol, RPC
    -- SECURITY DEFINER olduğu için RLS'in yerine geçer: aksi hâlde
    -- parametreye başka bir koçun kitabının id'si yazılarak havuzu
    -- kopyalanabilirdi.
    IF v_src.id IS NULL
       OR NOT public.is_library_workspace(v_src.workspace_id)
       OR v_src.status <> 'active'
       OR v_src.library_status <> 'approved'
    THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.workspace_id = p_workspace_id
        AND b.library_source_book_id = v_book_id
        AND b.status <> 'archived'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Havuz dönemden bağımsızdır (021): academic_term_id NULL kalır.
    v_new_id := public._copy_book_tree(
      p_book_id             => v_book_id,
      p_target_workspace_id => p_workspace_id,
      p_term_id             => NULL,
      p_title               => NULL,
      p_edition_year        => NULL,
      p_library_source      => v_book_id,
      p_library_status      => 'none'
    );

    v_new_ids := v_new_ids || v_new_id;
    v_copied := v_copied + 1;
  END LOOP;

  RETURN jsonb_build_object('copied', v_copied, 'skipped', v_skipped, 'book_ids', to_jsonb(v_new_ids));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.copy_library_books(UUID, UUID[]) TO authenticated;


-- ============================================================
-- 7) Koç önerisi ve admin kararı
--
-- ÖNERİ KİTABI TAŞIMAZ: koçun kitabı yerinde kalır ve öğrencileri
-- etkilenmez; yalnız library_status = 'pending' işaretlenir. Onay anında
-- kütüphaneye AYRI BİR KOPYA girer. Böylece koç kendi kitabını sonradan
-- değiştirdiğinde kütüphanedeki onaylı sürüm sessizce değişmez.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_book_to_library(p_book_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src public.books%ROWTYPE;
BEGIN
  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_src.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF public.is_library_workspace(v_src.workspace_id) THEN
    RAISE EXCEPTION 'Bu kaynak zaten kütüphanede';
  END IF;

  IF v_src.library_status = 'pending' THEN
    RAISE EXCEPTION 'Bu kaynak zaten değerlendirmede';
  END IF;

  IF v_src.library_status = 'approved' THEN
    RAISE EXCEPTION 'Bu kaynak kütüphaneye zaten eklendi';
  END IF;

  UPDATE public.books
  SET library_status = 'pending', library_review_note = NULL, updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id, 'library_status', 'pending');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.submit_book_to_library(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.approve_book_for_library(p_book_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_src        public.books%ROWTYPE;
  v_library_ws UUID;
  v_new_id     UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_src FROM public.books WHERE id = p_book_id;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF v_src.library_status <> 'pending' THEN
    RAISE EXCEPTION 'Yalnız değerlendirmedeki öneriler onaylanabilir';
  END IF;

  SELECT id INTO v_library_ws FROM public.workspaces WHERE is_library LIMIT 1;
  IF v_library_ws IS NULL THEN
    RAISE EXCEPTION 'Kütüphane çalışma alanı tanımlı değil';
  END IF;

  v_new_id := public._copy_book_tree(
    p_book_id             => p_book_id,
    p_target_workspace_id => v_library_ws,
    p_term_id             => NULL,
    p_title               => NULL,
    p_edition_year        => NULL,
    p_library_source      => NULL,
    p_library_status      => 'approved'
  );

  -- Koçun kitabı yerinde kalır; artık kütüphanedeki kopyaya işaret eder.
  UPDATE public.books
  SET library_status = 'approved',
      library_source_book_id = v_new_id,
      library_review_note = NULL,
      updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('library_book_id', v_new_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.approve_book_for_library(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_book_for_library(
  p_book_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT library_status INTO v_status FROM public.books WHERE id = p_book_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Kitap bulunamadı'; END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Yalnız değerlendirmedeki öneriler reddedilebilir';
  END IF;

  UPDATE public.books
  SET library_status = 'rejected',
      library_review_note = NULLIF(TRIM(COALESCE(p_reason, '')), ''),
      updated_at = NOW()
  WHERE id = p_book_id;

  RETURN jsonb_build_object('book_id', p_book_id, 'library_status', 'rejected');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.reject_book_for_library(UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- admin_list_library_submissions — bekleyen öneriler
--
-- Öneri kitapları KOÇLARIN çalışma alanlarında duruyor; admin oraların
-- üyesi değil ve RLS onları göstermez. Listeyi görmenin tek yolu, 060'ın
-- admin_list_tickets deseniyle aynı: is_platform_admin() kontrollü bir
-- SECURITY DEFINER görünümü.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_library_submissions(
  p_status TEXT DEFAULT 'pending',
  p_limit  INTEGER DEFAULT 100
)
RETURNS TABLE (
  book_id        UUID,
  workspace_name TEXT,
  submitted_by   TEXT,
  title          TEXT,
  subject        TEXT,
  publisher      TEXT,
  level_exam     TEXT,
  edition_year   INTEGER,
  resource_type  TEXT,
  tracking_mode  TEXT,
  section_count  INTEGER,
  unit_count     INTEGER,
  library_status TEXT,
  review_note    TEXT,
  updated_at     TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    b.id, w.name, p.full_name, b.title, b.subject, b.publisher,
    b.level_exam, b.edition_year, b.resource_type, b.tracking_mode,
    (SELECT COUNT(*)::INTEGER FROM public.book_sections bs
      WHERE bs.book_id = b.id AND bs.status = 'active'),
    (SELECT COUNT(*)::INTEGER FROM public.book_tests bt
      WHERE bt.book_id = b.id AND bt.status = 'active'),
    b.library_status, b.library_review_note, b.updated_at
  FROM public.books b
  JOIN public.workspaces w ON w.id = b.workspace_id
  LEFT JOIN public.profiles p ON p.id = b.created_by_profile_id
  WHERE b.status <> 'archived'
    AND NOT w.is_library
    AND b.library_status = COALESCE(p_status, b.library_status)
    AND b.library_status <> 'none'
  ORDER BY (b.library_status = 'pending') DESC, b.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_library_submissions(TEXT, INTEGER) TO authenticated;


-- ============================================================
-- 8) Kütüphane çalışma alanı kurulumu (yalnız admin)
--
-- Kütüphane alanı elle SQL ile açılmasın diye: admin arayüzden bir kez
-- çağırır, alan yoksa oluşturulur ve kendisi owner olarak eklenir.
-- Zaten varsa mevcut id döner (idempotent).
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_library_workspace()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id         UUID;
  v_profile_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id INTO v_id FROM public.workspaces WHERE is_library LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_profile_id := public.current_profile_id();

  INSERT INTO public.workspaces (name, type, owner_profile_id, is_library)
  VALUES ('Kaynak Kütüphanesi', 'institution', v_profile_id, TRUE)
  RETURNING id INTO v_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status)
  VALUES (v_id, v_profile_id, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ensure_library_workspace() TO authenticated;


-- ============================================================
-- ROLLBACK
--
-- Kütüphaneden kopyalanmış kitaplar koçların havuzunda KALIR — onlar
-- bağımsız kayıtlardır ve silinmeleri veri kaybı olurdu. Geri alma yalnız
-- kütüphane katmanını kaldırır.
--
--   DROP FUNCTION IF EXISTS public.ensure_library_workspace();
--   DROP FUNCTION IF EXISTS public.admin_list_library_submissions(TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS public.reject_book_for_library(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.approve_book_for_library(UUID);
--   DROP FUNCTION IF EXISTS public.submit_book_to_library(UUID);
--   DROP FUNCTION IF EXISTS public.copy_library_books(UUID, UUID[]);
--
--   -- duplicate_book_as_edition'ın 048'deki kendi kendine yeten gövdesi
--   -- geri yüklenmelidir; _copy_book_tree ondan SONRA düşürülür.
--   -- (048_edition_copy_subsections.sql dosyasındaki CREATE OR REPLACE
--   --  bloğunu aynen çalıştır.)
--   DROP FUNCTION IF EXISTS public._copy_book_tree(UUID, UUID, UUID, TEXT, INTEGER, UUID, TEXT);
--
--   -- SELECT politikalarının kütüphane kolu 026 ve 042/043'teki hâline
--   -- döndürülmelidir (o dosyalardaki CREATE POLICY blokları).
--   DROP FUNCTION IF EXISTS public.library_workspace_id();
--   DROP FUNCTION IF EXISTS public.can_read_library();
--   DROP FUNCTION IF EXISTS public.is_library_workspace(UUID);
--
--   DROP INDEX IF EXISTS public.idx_books_library_pending;
--   DROP INDEX IF EXISTS public.idx_books_library_source;
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_library_status_check;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS library_review_note;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS library_status;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS library_source_book_id;
--   DROP INDEX IF EXISTS public.idx_workspaces_single_library;
--   ALTER TABLE public.workspaces DROP COLUMN IF EXISTS is_library;
-- ============================================================
