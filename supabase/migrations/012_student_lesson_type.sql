-- ============================================================
-- 012_student_lesson_type
-- Adds a lesson-type classification to students, selected at
-- student creation: in-person 1:1, online 1:1, online group,
-- or individual coaching (no book/test tracking, coaching-only).
-- Mirrors the existing exam_type CHECK pattern (nullable, no default).
-- ============================================================
ALTER TABLE public.students
  ADD COLUMN lesson_type TEXT
  CHECK (lesson_type IN ('yuz_yuze_ozel', 'online_birebir', 'online_grup', 'bireysel_kocluk'));
