-- ============================================================
-- 022_page_units_and_targets  (R4 - Dilim 2)
--
-- İKİ DEĞİŞİKLİK:
--
-- A) SAYFA = BİRİM SATIR
--    013 bilinçli bir kısayol seçmişti: sayfa takipli kitapta bir
--    book_tests satırı "bir sayfa aralığı birimi"ni temsil ediyordu ve
--    ilerleme birim sayısıyla hesaplanıyordu. R4 §4 ise gerçek sayfa
--    matematiği istiyor: benzersiz sayfa birleşimi, otomatik türetilen
--    kalan aralıklar ve 43/56 = %77 gibi bölüm yüzdesi.
--
--    Çözüm mevcut makineyi çatallamak değil, birimi küçültmek: sayfa
--    takipli kitapta HER FİZİKSEL SAYFA tek bir book_tests satırıdır
--    (page_start = page_end = sayfa no). Bunun bedava getirdikleri:
--      - Aynı sayfa iki kez sayılamaz; aynı sayfa = aynı satır ve
--        test_completions üzerindeki kısmi benzersiz indeks (001) zaten
--        tek aktif tamamlama garantisi veriyor.
--      - Bölüm yüzdesi = tamamlanan satır / bölüm satırı.
--      - student_book_progress_view, calculatePlanTempo ve
--        calculatePlanPace HİÇ DEĞİŞMEDEN doğru sonuç üretir.
--
-- B) HEDEF KAPSAMI
--    Plan matematiği bugüne dek hep kitabın tamamını kapsıyordu. R4 §5
--    "planın kapsamı"nı değiştirilebilir kılıyor: tüm kitap / seçili
--    bölümler / seçili birimler. Matematik değişmiyor; yalnızca T ve C'yi
--    besleyen küme daralıyor.
-- ============================================================

-- ============================================================
-- A1) book_sections - fiziksel kapsam
-- ============================================================
ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end   INTEGER;

ALTER TABLE public.book_sections DROP CONSTRAINT IF EXISTS book_sections_page_range_chk;
ALTER TABLE public.book_sections
  ADD CONSTRAINT book_sections_page_range_chk
  CHECK (page_end IS NULL OR page_start IS NULL OR page_end >= page_start);

-- ============================================================
-- A2) create_page_section
--
-- "Üçgenler sf. 1-56" der demez bölümü ve 56 sayfa satırını açar.
-- 018'deki desen: SECURITY DEFINER + owner/teacher kontrolü + Türkçe hata.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_page_section(
  p_book_id    UUID,
  p_title      TEXT,
  p_page_start INTEGER,
  p_page_end   INTEGER,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
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

  SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_order
  FROM public.book_sections WHERE book_id = p_book_id;

  INSERT INTO public.book_sections (workspace_id, book_id, title, order_index, note, page_start, page_end)
  VALUES (v_workspace_id, p_book_id, TRIM(p_title), v_order,
          NULLIF(TRIM(COALESCE(p_note, '')), ''), p_page_start, p_page_end)
  RETURNING id INTO v_section_id;

  -- Her sayfa bir birim satırı. order_index = sayfa no, böylece matris
  -- sütunu ile fiziksel sayfa numarası aynı şeyi ifade eder.
  INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
  SELECT v_workspace_id, p_book_id, v_section_id, 'sf. ' || n, n, n, n
  FROM generate_series(p_page_start, p_page_end) AS n;

  RETURN jsonb_build_object(
    'section_id', v_section_id,
    'page_count', p_page_end - p_page_start + 1
  );
END;
$fn$;

-- ============================================================
-- A3) Geriye dönük çeviri
--
-- Mevcut tracking_mode='page' kitaplarda her book_tests satırı BİR ARALIĞI
-- temsil ediyordu. Bunları sayfa satırlarına açıyoruz. Aralığa bağlı
-- homework_items ve test_completions kayıtları aralığın TÜM sayfalarına
-- genişletilir: öğrencinin bitirdiği iş kaybolmaz, aksine artık gerçek
-- sayfa sayısıyla ifade edilir.
--
-- İdempotent: yalnızca page_end > page_start olan (yani hâlâ aralık
-- temsil eden) satırlar dönüştürülür. Tekrar çalıştırıldığında dönüşecek
-- satır kalmaz.
--
-- Sayfa aralığı hiç girilmemiş (page_start IS NULL) eski satırlara
-- DOKUNULMAZ: onların hangi sayfaya karşılık geldiği bilinmiyor, tahmin
-- etmek veriyi bozardı. O kitaplar eski birim-sayım davranışıyla çalışmaya
-- devam eder ve öğretmen sayfa aralığını girdiğinde bu migration'ın
-- mantığı create_page_section üzerinden yeniden kurulabilir.
-- ============================================================
DO $convert$
DECLARE
  v_unit           RECORD;
  v_page           INT;
  v_new_test_id    UUID;
  v_converted      INT := 0;
  v_pages_created  INT := 0;
BEGIN
  FOR v_unit IN
    SELECT bt.*, b.workspace_id AS ws
    FROM public.book_tests bt
    JOIN public.books b ON b.id = bt.book_id
    WHERE b.tracking_mode = 'page'
      AND bt.page_start IS NOT NULL
      AND bt.page_end IS NOT NULL
      AND bt.page_end > bt.page_start
    ORDER BY bt.section_id, bt.order_index
  LOOP
    v_converted := v_converted + 1;

    FOR v_page IN v_unit.page_start..v_unit.page_end LOOP
      -- İlk sayfa mevcut satırın kendisi olur: ona bağlı ödev/tamamlama
      -- kayıtları böylece hiç taşınmadan geçerli kalır.
      IF v_page = v_unit.page_start THEN
        UPDATE public.book_tests
        SET title = 'sf. ' || v_page, page_start = v_page, page_end = v_page
        WHERE id = v_unit.id;
        CONTINUE;
      END IF;

      -- order_index çakışmasın diye kalan sayfalar bölümün sonuna eklenir;
      -- gerçek sayfa numarası page_start/page_end'de duruyor.
      INSERT INTO public.book_tests (
        workspace_id, book_id, section_id, title, order_index, page_start, page_end
      )
      SELECT v_unit.ws, v_unit.book_id, v_unit.section_id, 'sf. ' || v_page,
             COALESCE(MAX(order_index), 0) + 1, v_page, v_page
      FROM public.book_tests WHERE section_id = v_unit.section_id
      RETURNING id INTO v_new_test_id;

      v_pages_created := v_pages_created + 1;

      -- Aralığa verilmiş ödev kalemini her sayfaya genişlet.
      INSERT INTO public.homework_items (
        workspace_id, homework_batch_id, student_book_assignment_id, book_id,
        section_id, book_test_id, status, completed_at, completed_by_profile_id,
        submitted_at, submitted_by_profile_id, approved_at, approved_by_profile_id,
        rejected_at, teacher_note
      )
      SELECT hi.workspace_id, hi.homework_batch_id, hi.student_book_assignment_id, hi.book_id,
             hi.section_id, v_new_test_id, hi.status, hi.completed_at, hi.completed_by_profile_id,
             hi.submitted_at, hi.submitted_by_profile_id, hi.approved_at, hi.approved_by_profile_id,
             hi.rejected_at, hi.teacher_note
      FROM public.homework_items hi
      WHERE hi.book_test_id = v_unit.id
      ON CONFLICT (homework_batch_id, book_test_id) DO NOTHING;

      -- Onaylanmış tamamlamayı her sayfaya genişlet: yüzde geriye gitmesin.
      INSERT INTO public.test_completions (
        workspace_id, academic_term_id, student_id, student_book_assignment_id,
        book_test_id, completed_at, completed_by_profile_id, source,
        source_homework_item_id, status
      )
      SELECT tc.workspace_id, tc.academic_term_id, tc.student_id, tc.student_book_assignment_id,
             v_new_test_id, tc.completed_at, tc.completed_by_profile_id, tc.source,
             NULL, tc.status
      FROM public.test_completions tc
      WHERE tc.book_test_id = v_unit.id AND tc.status = 'active';
    END LOOP;

    -- Bölümün fiziksel kapsamını alt satırlardan türet.
    UPDATE public.book_sections s
    SET page_start = sub.min_page, page_end = sub.max_page
    FROM (
      SELECT section_id, MIN(page_start) AS min_page, MAX(page_end) AS max_page
      FROM public.book_tests
      WHERE section_id = v_unit.section_id
      GROUP BY section_id
    ) sub
    WHERE s.id = sub.section_id;
  END LOOP;

  RAISE NOTICE '022: % aralık birimi sayfa satırına açıldı, % yeni sayfa oluşturuldu.',
    v_converted, v_pages_created;
END;
$convert$;

-- ============================================================
-- B1) student_book_targets
--
-- Arayüzde tek aktif hedef yeterlidir (R4 §5). Yine de hedefleri ayrı
-- SATIRLAR halinde modelliyoruz: ileride aynı kitapta ardışık hedefler
-- (Hedef 2/3) UI eklenirse şema hazır olsun, bu sürümde eklenmesin.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_book_targets (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_book_assignment_id  UUID NOT NULL REFERENCES public.student_book_assignments(id) ON DELETE CASCADE,
  start_date                  DATE,
  target_date                 DATE,
  -- whole_book: kitabın tamamı | sections: seçili bölümler | units: seçili test/sayfa
  scope_type                  TEXT NOT NULL DEFAULT 'whole_book'
                                CHECK (scope_type IN ('whole_book', 'sections', 'units')),
  -- sections -> {"section_ids": [...]}, units -> {"unit_ids": [...]}
  scope_data                  JSONB NOT NULL DEFAULT '{}'::JSONB,
  active                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_profile_id       UUID REFERENCES public.profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atama başına yalnız TEK aktif hedef. Pasif hedefler geçmiş olarak kalır.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_student_book_target
  ON public.student_book_targets (student_book_assignment_id)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_student_book_targets_workspace
  ON public.student_book_targets (workspace_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_book_targets;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_book_targets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- B2) RLS - 003'teki desenin aynısı
-- Okuma: öğretmen kadrosu + kendi öğrencisi + bağlı veli.
-- Yazma: yalnız owner/teacher.
-- ============================================================
ALTER TABLE public.student_book_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_book_targets_select ON public.student_book_targets;
CREATE POLICY student_book_targets_select ON public.student_book_targets
  FOR SELECT USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher', 'assistant'])
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = student_book_targets.student_book_assignment_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS student_book_targets_insert ON public.student_book_targets;
CREATE POLICY student_book_targets_insert ON public.student_book_targets
  FOR INSERT WITH CHECK (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
  );

DROP POLICY IF EXISTS student_book_targets_update ON public.student_book_targets;
CREATE POLICY student_book_targets_update ON public.student_book_targets
  FOR UPDATE USING (
    public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])
  );

-- ============================================================
-- B3) set_student_book_target
--
-- Tek aktif hedef kuralını uygulayan tek giriş noktası: varsa eskisini
-- pasife alır, yenisini açar. Hedef tarihleri student_book_assignments
-- üzerinde de güncellenir, çünkü mevcut view'lar ve TempoStrip oradan
-- okuyor — iki kaynak arasında sapma olmasın.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_student_book_target(
  p_assignment_id UUID,
  p_start_date    DATE,
  p_target_date   DATE,
  p_scope_type    TEXT DEFAULT 'whole_book',
  p_scope_data    JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_workspace_id UUID;
  v_profile_id   UUID;
  v_target_id    UUID;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_scope_type NOT IN ('whole_book', 'sections', 'units') THEN
    RAISE EXCEPTION 'Geçersiz hedef kapsamı';
  END IF;

  IF p_start_date IS NOT NULL AND p_target_date IS NOT NULL AND p_target_date < p_start_date THEN
    RAISE EXCEPTION 'Hedef tarihi başlangıçtan önce olamaz';
  END IF;

  UPDATE public.student_book_targets
  SET active = FALSE, updated_at = NOW()
  WHERE student_book_assignment_id = p_assignment_id AND active;

  INSERT INTO public.student_book_targets (
    workspace_id, student_book_assignment_id, start_date, target_date,
    scope_type, scope_data, active, created_by_profile_id
  ) VALUES (
    v_workspace_id, p_assignment_id, p_start_date, p_target_date,
    p_scope_type, COALESCE(p_scope_data, '{}'::JSONB), TRUE, v_profile_id
  ) RETURNING id INTO v_target_id;

  UPDATE public.student_book_assignments
  SET start_date = p_start_date, target_end_date = p_target_date, updated_at = NOW()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object('target_id', v_target_id);
END;
$fn$;


-- ============================================================
-- A4) create_book_with_sections_and_tests - sayfa bölümleriyle
--
-- 021'deki gövde korunur; tek fark, sayfa takipli kitapta bölümün
-- test sayısıyla değil FİZİKSEL KAPSAMIYLA tanımlanabilmesi:
--
--   p_sections = [{"title": "Üçgenler", "page_start": 1, "page_end": 56,
--                  "note": "Konu anlatımı + uygulama"}]
--
-- Bu durumda aralıktaki her sayfa için bir birim satırı açılır. Test
-- kitabında davranış değişmez (test_count).
-- ============================================================
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
  v_page_start    INT;
  v_page_end      INT;
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

    v_page_start := NULLIF(v_section->>'page_start', '')::INT;
    v_page_end   := NULLIF(v_section->>'page_end', '')::INT;

    IF p_tracking_mode = 'page' AND v_page_start IS NOT NULL AND v_page_end IS NOT NULL THEN
      IF v_page_start < 1 OR v_page_end < v_page_start THEN
        RAISE EXCEPTION 'Geçerli bir sayfa aralığı girin';
      END IF;
      IF (v_page_end - v_page_start + 1) > 1000 THEN
        RAISE EXCEPTION 'Bir bölüm en fazla 1000 sayfa olabilir';
      END IF;
    END IF;

    INSERT INTO public.book_sections (
      workspace_id, book_id, title, order_index, note, video_url, page_start, page_end
    )
    VALUES (
      p_workspace_id, v_book_id, v_section->>'title', v_order,
      NULLIF(TRIM(COALESCE(v_section->>'note', '')), ''),
      NULLIF(TRIM(COALESCE(v_section->>'video_url', '')), ''),
      CASE WHEN p_tracking_mode = 'page' THEN v_page_start END,
      CASE WHEN p_tracking_mode = 'page' THEN v_page_end END
    )
    RETURNING id INTO v_section_id;

    IF p_tracking_mode = 'page' AND v_page_start IS NOT NULL AND v_page_end IS NOT NULL THEN
      INSERT INTO public.book_tests (workspace_id, book_id, section_id, title, order_index, page_start, page_end)
      SELECT p_workspace_id, v_book_id, v_section_id, 'sf. ' || n, n, n, n
      FROM generate_series(v_page_start, v_page_end) AS n;

      v_total_tests := v_total_tests + (v_page_end - v_page_start + 1);
      CONTINUE;
    END IF;

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
