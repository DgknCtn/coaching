-- ============================================================
-- 017_pending_approval_all_weeks
-- Revizyon 01 düzeltmesi: "Onay bekleyen" sayacı hâlâ hafta
-- penceresine bağlıydı (current_week_pending_approval_tests,
-- 014'ten gelen weekly view üzerinden). Bu yüzden dashboard kartı
-- "2" derken /teacher/tasks?filter=approval listesi 5 satır
-- gösterebiliyordu — geçen haftaya ait onay bekleyenler karta
-- yansımıyordu.
--
-- 016'da "geciken çalışma" için yapılanın aynısı: hafta bağımsız
-- sayım. Kabul kriteri "öğrencinin tamamladığı fakat öğretmenin
-- onaylamadığı görevler doğru yansısın" diyor; teslim haftası bu
-- tanımın parçası değil.
-- ============================================================

CREATE OR REPLACE VIEW public.student_pending_approval_view AS
SELECT
  hb.workspace_id,
  hb.student_id,
  COUNT(hi.id)                                     AS pending_approval_items,
  MIN(hi.submitted_at)                             AS oldest_submitted_at
FROM public.homework_batches hb
JOIN public.homework_items hi ON hi.homework_batch_id = hb.id
WHERE hb.status = 'active'
  AND hi.status = 'pending_approval'
GROUP BY hb.workspace_id, hb.student_id;

-- CREATE OR REPLACE VIEW kolon sırasını değiştiremez (Postgres 42P16):
-- 016'daki sıra korundu, yeni kolonlar yalnızca sona eklendi.
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
  END                                                   AS risk_status,
  COALESCE(w.pending_approval_tests, 0)                 AS current_week_pending_approval_tests,
  COALESCE(o.overdue_items, 0)                          AS total_overdue_items,
  c.last_check_in_at                                    AS last_check_in_at,
  c.pending_check_in_since                              AS pending_check_in_since,
  (c.pending_check_in_since IS NOT NULL)                AS is_check_in_overdue,
  -- 017'de eklenen (yalnızca sona):
  COALESCE(a.pending_approval_items, 0)                 AS total_pending_approval_items
FROM public.students s
LEFT JOIN progress p ON p.student_id = s.id AND p.workspace_id = s.workspace_id
LEFT JOIN weekly w   ON w.student_id = s.id AND w.workspace_id = s.workspace_id
LEFT JOIN public.student_overdue_homework_view o
       ON o.student_id = s.id AND o.workspace_id = s.workspace_id
LEFT JOIN public.student_check_in_status_view c
       ON c.student_id = s.id AND c.workspace_id = s.workspace_id
LEFT JOIN public.student_pending_approval_view a
       ON a.student_id = s.id AND a.workspace_id = s.workspace_id
WHERE s.status = 'active';
