-- ============================================================
-- 009_books_exam_type_parity
-- Fix CHECK mismatch: students.exam_type allows
-- TYT/AYT/LGS/KPSS/DGS/Other, but books.exam_type only allowed
-- TYT/AYT/LGS/Other. This prevented creating books (and thus
-- assigning them) for KPSS/DGS students.
--
-- Align books.exam_type with students.exam_type.
-- ============================================================
ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_exam_type_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_exam_type_check
  CHECK (exam_type IN ('TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other'));
