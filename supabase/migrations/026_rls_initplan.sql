-- ============================================================
-- 026_rls_initplan
--
-- RLS politikalarında yardımcı fonksiyonlar SATIR BAŞINA çağrılıyordu:
--
--   USING (public.has_workspace_role(workspace_id, ARRAY['owner','teacher']))
--
-- Postgres bu ifadeyi taranan her satır için yeniden değerlendirir. Sayfa
-- takipli kitaplarla birlikte book_tests satır sayısı 400 kata çıktığı
-- için (022: her fiziksel sayfa bir satır) bu, kitap haritası sorgularında
-- on binlerce gereksiz fonksiyon çağrısı demek.
--
-- Çözüm, ifadeyi bir alt sorguya sarmak:
--
--   USING ((SELECT public.has_workspace_role(...)))
--
-- Böylece planlayıcı bunu InitPlan'a çevirir ve sorgu başına BİR KEZ
-- çalıştırır. Bu, Supabase'in kendi "RLS performance" rehberindeki
-- standart desendir.
--
-- KAPSAM: yalnızca satır sayısı yüksek tablolar. profiles/workspaces/
-- invitations gibi küçük tablolarda kazanç yok, dokunulmuyor.
--
-- GÜVENLİK: ifadelerin mantığı 003_rls_policies.sql'deki HALİYLE BİREBİR
-- aynıdır — yalnız parantez eklendi. Kimin neyi görebildiği değişmez.
-- Sarmalanan çağrılar argüman olarak satır kolonu almadığı (workspace_id
-- gibi sabit bir değer aldığı) yerlerde InitPlan doğru sonucu verir;
-- satır kolonuna bağlı olan EXISTS(...) alt sorguları OLDUĞU GİBİ bırakıldı.
-- ============================================================

-- ============================================================
-- books
-- ============================================================
DROP POLICY IF EXISTS "books_select" ON public.books;
CREATE POLICY "books_select" ON public.books
  FOR SELECT USING (
    (SELECT public.has_workspace_role(books.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = books.id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS "books_insert_teacher" ON public.books;
CREATE POLICY "books_insert_teacher" ON public.books
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(books.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "books_update_teacher" ON public.books;
CREATE POLICY "books_update_teacher" ON public.books
  FOR UPDATE USING ((SELECT public.has_workspace_role(books.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- book_sections
-- ============================================================
DROP POLICY IF EXISTS "sections_select" ON public.book_sections;
CREATE POLICY "sections_select" ON public.book_sections
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_sections.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_sections.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS "sections_insert_teacher" ON public.book_sections;
CREATE POLICY "sections_insert_teacher" ON public.book_sections
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(book_sections.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "sections_update_teacher" ON public.book_sections;
CREATE POLICY "sections_update_teacher" ON public.book_sections
  FOR UPDATE USING ((SELECT public.has_workspace_role(book_sections.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- book_tests  — sayfa modeliyle en çok büyüyen tablo
-- ============================================================
DROP POLICY IF EXISTS "tests_select" ON public.book_tests;
CREATE POLICY "tests_select" ON public.book_tests
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_tests.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.book_id = book_tests.book_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS "tests_insert_teacher" ON public.book_tests;
CREATE POLICY "tests_insert_teacher" ON public.book_tests
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(book_tests.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "tests_update_teacher" ON public.book_tests;
CREATE POLICY "tests_update_teacher" ON public.book_tests
  FOR UPDATE USING ((SELECT public.has_workspace_role(book_tests.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- student_book_assignments
-- ============================================================
DROP POLICY IF EXISTS "sba_select" ON public.student_book_assignments;
CREATE POLICY "sba_select" ON public.student_book_assignments
  FOR SELECT USING (
    (SELECT public.has_workspace_role(student_book_assignments.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

DROP POLICY IF EXISTS "sba_insert_teacher" ON public.student_book_assignments;
CREATE POLICY "sba_insert_teacher" ON public.student_book_assignments
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(student_book_assignments.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "sba_update_teacher" ON public.student_book_assignments;
CREATE POLICY "sba_update_teacher" ON public.student_book_assignments
  FOR UPDATE USING ((SELECT public.has_workspace_role(student_book_assignments.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- homework_batches
-- ============================================================
DROP POLICY IF EXISTS "hb_select" ON public.homework_batches;
CREATE POLICY "hb_select" ON public.homework_batches
  FOR SELECT USING (
    (SELECT public.has_workspace_role(homework_batches.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

DROP POLICY IF EXISTS "hb_insert_teacher" ON public.homework_batches;
CREATE POLICY "hb_insert_teacher" ON public.homework_batches
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(homework_batches.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "hb_update_teacher" ON public.homework_batches;
CREATE POLICY "hb_update_teacher" ON public.homework_batches
  FOR UPDATE USING ((SELECT public.has_workspace_role(homework_batches.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- homework_items
-- ============================================================
DROP POLICY IF EXISTS "hi_select" ON public.homework_items;
CREATE POLICY "hi_select" ON public.homework_items
  FOR SELECT USING (
    (SELECT public.has_workspace_role(homework_items.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.homework_batches hb
      WHERE hb.id = homework_items.homework_batch_id
        AND (public.is_student_self(hb.student_id) OR public.is_parent_of_student(hb.student_id))
    )
  );

DROP POLICY IF EXISTS "hi_insert_teacher" ON public.homework_items;
CREATE POLICY "hi_insert_teacher" ON public.homework_items
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(homework_items.workspace_id, ARRAY['owner', 'teacher'])));

-- Teachers can update any field; students can ONLY update status via RPC (no direct update policy)
DROP POLICY IF EXISTS "hi_update_teacher" ON public.homework_items;
CREATE POLICY "hi_update_teacher" ON public.homework_items
  FOR UPDATE USING ((SELECT public.has_workspace_role(homework_items.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- test_completions
-- ============================================================
DROP POLICY IF EXISTS "tc_select" ON public.test_completions;
CREATE POLICY "tc_select" ON public.test_completions
  FOR SELECT USING (
    (SELECT public.has_workspace_role(test_completions.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR public.is_student_self(student_id)
    OR public.is_parent_of_student(student_id)
  );

-- Students and teachers create completions via RPC (SECURITY DEFINER) — no direct insert policy
DROP POLICY IF EXISTS "tc_insert_teacher" ON public.test_completions;
CREATE POLICY "tc_insert_teacher" ON public.test_completions
  FOR INSERT WITH CHECK ((SELECT public.has_workspace_role(test_completions.workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS "tc_update_teacher" ON public.test_completions;
CREATE POLICY "tc_update_teacher" ON public.test_completions
  FOR UPDATE USING ((SELECT public.has_workspace_role(test_completions.workspace_id, ARRAY['owner', 'teacher'])));
