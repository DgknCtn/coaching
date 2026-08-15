-- ============================================================
-- 013_book_tracking_mode
-- Lets the teacher choose, at book creation, whether progress on
-- that book is tracked by test count (existing behavior) or by
-- page range. Reuses the existing book_tests/homework_items
-- machinery: when tracking_mode = 'page', each book_tests row
-- represents a page-range unit instead of a literal "test", so
-- assignment/homework/progress RPCs and views need no forking —
-- only labels differ in the UI. Progress % stays unit-count based
-- (e.g. "3/10 sayfa aralığı tamamlandı"), not a true page sum.
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'test';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_tracking_mode_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_tracking_mode_check
  CHECK (tracking_mode IN ('test', 'page'));

ALTER TABLE public.book_tests
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER;

ALTER TABLE public.book_tests
  DROP CONSTRAINT IF EXISTS book_tests_page_range_chk;

ALTER TABLE public.book_tests
  ADD CONSTRAINT book_tests_page_range_chk
    CHECK (page_end IS NULL OR page_start IS NULL OR page_end >= page_start);

-- Expose tracking_mode on the progress view so the UI can label
-- units as "Test" or "Sayfa Aralığı" without changing the count formula.
-- Body is otherwise identical to 004_views.sql's student_book_progress_view,
-- with b.tracking_mode appended (additive — downstream views/consumers that
-- SELECT existing columns by name are unaffected).
-- NOT: CREATE OR REPLACE VIEW mevcut kolonların sırasını/adını değiştiremez,
-- sadece SONA yeni kolon eklenebilir (Postgres 42P16 hatası verir aksi halde).
-- Bu yüzden tracking_mode, orijinal 004_views.sql sırasını bozmamak için
-- en sona (completion_percentage'dan sonra) eklendi.
CREATE OR REPLACE VIEW public.student_book_progress_view AS
SELECT
  sba.workspace_id,
  sba.academic_term_id,
  sba.student_id,
  sba.id                                            AS student_book_assignment_id,
  sba.book_id,
  b.title                                           AS book_title,
  b.subject,
  b.exam_type,
  b.publisher,
  sba.start_date,
  sba.target_end_date,
  sba.status                                        AS assignment_status,
  COUNT(DISTINCT bt.id) FILTER (WHERE bt.status = 'active')
                                                    AS total_tests,
  COUNT(DISTINCT tc.id) FILTER (WHERE tc.status = 'active')
                                                    AS completed_tests,
  COUNT(DISTINCT bt.id) FILTER (WHERE bt.status = 'active')
  - COUNT(DISTINCT tc.id) FILTER (WHERE tc.status = 'active')
                                                    AS remaining_tests,
  CASE
    WHEN COUNT(DISTINCT bt.id) FILTER (WHERE bt.status = 'active') = 0 THEN 0
    ELSE ROUND(
      (COUNT(DISTINCT tc.id) FILTER (WHERE tc.status = 'active')::NUMERIC
       / COUNT(DISTINCT bt.id) FILTER (WHERE bt.status = 'active')::NUMERIC) * 100
    )
  END                                               AS completion_percentage,
  b.tracking_mode
FROM public.student_book_assignments sba
JOIN public.books b ON b.id = sba.book_id
JOIN public.book_tests bt ON bt.book_id = sba.book_id
LEFT JOIN public.test_completions tc
  ON  tc.student_book_assignment_id = sba.id
  AND tc.book_test_id = bt.id
  AND tc.status = 'active'
WHERE sba.status = 'active'
GROUP BY
  sba.workspace_id, sba.academic_term_id, sba.student_id,
  sba.id, sba.book_id, b.title, b.subject, b.exam_type, b.publisher, b.tracking_mode,
  sba.start_date, sba.target_end_date, sba.status;

-- Extend create_book_with_sections_and_tests to accept and store tracking_mode.
-- Body otherwise identical to 005_rpc_functions.sql.
CREATE OR REPLACE FUNCTION public.create_book_with_sections_and_tests(
  p_workspace_id      UUID,
  p_academic_term_id  UUID,
  p_title             TEXT,
  p_subject           TEXT,
  p_publisher         TEXT DEFAULT NULL,
  p_exam_type         TEXT DEFAULT NULL,
  p_description       TEXT DEFAULT NULL,
  p_sections          JSONB DEFAULT '[]'::JSONB,
  p_tracking_mode     TEXT DEFAULT 'test'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  -- Permission check
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Create book
  INSERT INTO public.books (
    workspace_id, academic_term_id, title, subject, publisher, exam_type, description, tracking_mode, created_by_profile_id
  ) VALUES (
    p_workspace_id, p_academic_term_id, p_title, p_subject, p_publisher, p_exam_type, p_description, p_tracking_mode, v_profile_id
  ) RETURNING id INTO v_book_id;

  -- Create sections and tests
  v_order := 0;
  FOR v_section IN SELECT * FROM jsonb_array_elements(p_sections) LOOP
    v_order := v_order + 1;

    INSERT INTO public.book_sections (workspace_id, book_id, title, order_index)
    VALUES (p_workspace_id, v_book_id, v_section->>'title', v_order)
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
$$;
