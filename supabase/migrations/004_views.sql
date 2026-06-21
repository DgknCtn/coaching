-- ============================================================
-- 004_views.sql
-- Computed views for dashboard, student, and parent panels
-- ============================================================

-- ============================================================
-- student_book_progress_view
-- Per-student, per-assignment progress metrics
-- ============================================================
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
  END                                               AS completion_percentage
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
  sba.id, sba.book_id, b.title, b.subject, b.exam_type, b.publisher,
  sba.start_date, sba.target_end_date, sba.status;

-- ============================================================
-- student_weekly_homework_summary_view
-- Per-student weekly homework summary (current ISO week)
-- ============================================================
CREATE OR REPLACE VIEW public.student_weekly_homework_summary_view AS
SELECT
  hb.workspace_id,
  hb.academic_term_id,
  hb.student_id,
  DATE_TRUNC('week', CURRENT_DATE)::DATE              AS week_start,
  (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE AS week_end,
  COUNT(hi.id) FILTER (WHERE hi.status != 'cancelled')
                                                      AS assigned_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'completed')
                                                      AS completed_tests,
  COUNT(hi.id) FILTER (WHERE hi.status = 'pending')
                                                      AS pending_tests,
  COUNT(hi.id) FILTER (
    WHERE hi.status = 'pending'
      AND hb.due_date < CURRENT_DATE
  )                                                   AS overdue_tests
FROM public.homework_batches hb
JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
WHERE hb.status = 'active'
  AND hb.due_date BETWEEN DATE_TRUNC('week', CURRENT_DATE)::DATE
                      AND (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE
GROUP BY hb.workspace_id, hb.academic_term_id, hb.student_id;

-- ============================================================
-- teacher_student_overview_view
-- All students in workspace with risk status — for teacher dashboard
-- ============================================================
CREATE OR REPLACE VIEW public.teacher_student_overview_view AS
WITH weekly AS (
  SELECT * FROM public.student_weekly_homework_summary_view
),
progress AS (
  SELECT
    student_id,
    workspace_id,
    SUM(total_tests)       AS total_tests,
    SUM(completed_tests)   AS completed_tests,
    SUM(remaining_tests)   AS remaining_tests,
    CASE
      WHEN SUM(total_tests) = 0 THEN 0
      ELSE ROUND(SUM(completed_tests)::NUMERIC / SUM(total_tests)::NUMERIC * 100)
    END                    AS completion_percentage,
    COUNT(*)               AS active_book_count
  FROM public.student_book_progress_view
  GROUP BY student_id, workspace_id
)
SELECT
  s.workspace_id,
  s.id                                                  AS student_id,
  s.full_name                                           AS student_full_name,
  s.exam_type,
  s.grade_level,
  s.status                                              AS student_status,
  COALESCE(p.active_book_count, 0)                      AS active_book_count,
  COALESCE(p.total_tests, 0)                            AS total_tests,
  COALESCE(p.completed_tests, 0)                        AS completed_tests,
  COALESCE(p.remaining_tests, 0)                        AS remaining_tests,
  COALESCE(p.completion_percentage, 0)                  AS completion_percentage,
  COALESCE(w.assigned_tests, 0)                         AS current_week_assigned_tests,
  COALESCE(w.completed_tests, 0)                        AS current_week_completed_tests,
  COALESCE(w.overdue_tests, 0)                          AS overdue_tests,
  CASE
    WHEN COALESCE(w.overdue_tests, 0) > 0               THEN 'red'
    WHEN COALESCE(w.assigned_tests, 0) = 0              THEN 'neutral'
    WHEN COALESCE(w.completed_tests, 0) >= COALESCE(w.assigned_tests, 0) THEN 'green'
    ELSE 'yellow'
  END                                                   AS risk_status
FROM public.students s
LEFT JOIN progress p ON p.student_id = s.id AND p.workspace_id = s.workspace_id
LEFT JOIN weekly w   ON w.student_id = s.id AND w.workspace_id = s.workspace_id
WHERE s.status = 'active';
