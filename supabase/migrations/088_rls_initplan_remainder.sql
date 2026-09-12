-- ============================================================
-- 088_rls_initplan_remainder
--
-- 026 RLS yardımcı çağrılarını alt sorguya sarmıştı ama KAPSAMI DARDI
-- ve gerekçesi yanlış çıktı:
--
--   "KAPSAM: yalnızca satır sayısı yüksek tablolar. profiles/workspaces/
--    invitations gibi küçük tablolarda kazanç yok, dokunulmuyor."
--
-- Ölçüm bunun tersini söylüyor. Canlı veritabanının istatistikleri
-- (pg_stat_user_tables):
--
--   tablo              satır   indeks taraması
--   profiles              17     22.278.499
--   workspace_members     24     20.994.028
--   students              17      1.103.463
--
-- Belirleyici olan POLİTİKALI TABLONUN satır sayısı değil, o tablonun
-- KAÇ KEZ TARANDIĞI. `students` on yedi satır ama öğretmen panelindeki
-- her view onunla birleşiyor; politika her satırda `has_workspace_role`
-- çağırıyor, o da `workspace_members` ve `profiles` sorguluyor. On yedi
-- satırlık tablodan yirmi iki milyon tarama böyle çıkıyor.
--
-- DEĞİŞİKLİK: kalan 23 politikada `has_workspace_role(...)` çağrısı
-- `(SELECT has_workspace_role(...))` hâline getirildi. Planlayıcı bunu
-- InitPlan/SubPlan'a çevirip sorgu başına bir kez değerlendiriyor.
--
-- GÜVENLİK — MANTIK BİREBİR AYNI:
-- Yalnız parantez eklendi. Hiçbir koşul eklenmedi, kaldırılmadı ya da
-- gevşetilmedi; kimin neyi görebildiği değişmiyor. Politikaların şu anki
-- hâli CANLI VERİTABANINDAN (pg_policies) okunarak birebir yeniden
-- yazıldı — hafızadan ya da eski migration dosyalarından değil, çünkü
-- bazıları sonradan yeniden tanımlanmıştı.
--
-- SATIRA BAĞLI ÇAĞRILAR SARILMADI:
-- `is_student_self(id)` ve `is_parent_of_student(id)` politikalı satırın
-- KENDİ kimliğini alıyor; bunlar gerçekten satır başına değerlendirilmek
-- zorunda. 026 da aynı ayrımı yapmıştı.
--
-- 'assistant' ROLÜ KORUNDU:
-- Bu rol fiilen ölü (051'de middleware'den çıkarıldı) ama politikalardan
-- çıkarmak bir YETKİ değişikliğidir ve bir performans düzeltmesinin
-- arkasına gizlenmemeli. Ayrı bir iş.
--
-- Yeniden çalıştırılabilir: her CREATE POLICY öncesinde DROP IF EXISTS.
-- ============================================================

-- ============================================================
-- students — en kritik olanı: her öğretmen view'ı buraya uğruyor
-- ============================================================
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT USING (
    (SELECT public.has_workspace_role(students.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR public.is_student_self(id)
    OR public.is_parent_of_student(id)
  );

DROP POLICY IF EXISTS "students_insert_teacher" ON public.students;
CREATE POLICY "students_insert_teacher" ON public.students
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(students.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "students_update_teacher" ON public.students;
CREATE POLICY "students_update_teacher" ON public.students
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(students.workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- parent_student_links
-- ============================================================
DROP POLICY IF EXISTS "psl_select" ON public.parent_student_links;
CREATE POLICY "psl_select" ON public.parent_student_links
  FOR SELECT USING (
    (SELECT public.has_workspace_role(parent_student_links.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR parent_profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS "psl_insert_teacher" ON public.parent_student_links;
CREATE POLICY "psl_insert_teacher" ON public.parent_student_links
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(parent_student_links.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "psl_update_teacher" ON public.parent_student_links;
CREATE POLICY "psl_update_teacher" ON public.parent_student_links
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(parent_student_links.workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- invitations
-- ============================================================
DROP POLICY IF EXISTS "inv_select_teacher" ON public.invitations;
CREATE POLICY "inv_select_teacher" ON public.invitations
  FOR SELECT USING (
    (SELECT public.has_workspace_role(invitations.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "inv_insert_teacher" ON public.invitations;
CREATE POLICY "inv_insert_teacher" ON public.invitations
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(invitations.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "inv_update_teacher" ON public.invitations;
CREATE POLICY "inv_update_teacher" ON public.invitations
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(invitations.workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- academic_terms
-- ============================================================
DROP POLICY IF EXISTS "terms_insert_teacher" ON public.academic_terms;
CREATE POLICY "terms_insert_teacher" ON public.academic_terms
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(academic_terms.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "terms_update_teacher" ON public.academic_terms;
CREATE POLICY "terms_update_teacher" ON public.academic_terms
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(academic_terms.workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- student_book_targets
-- ============================================================
DROP POLICY IF EXISTS "student_book_targets_select" ON public.student_book_targets;
CREATE POLICY "student_book_targets_select" ON public.student_book_targets
  FOR SELECT USING (
    (SELECT public.has_workspace_role(student_book_targets.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = student_book_targets.student_book_assignment_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS "student_book_targets_insert" ON public.student_book_targets;
CREATE POLICY "student_book_targets_insert" ON public.student_book_targets
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(student_book_targets.workspace_id, ARRAY['owner', 'teacher']))
    AND EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = student_book_targets.student_book_assignment_id
        AND sba.workspace_id = student_book_targets.workspace_id
    )
  );

DROP POLICY IF EXISTS "student_book_targets_update" ON public.student_book_targets;
CREATE POLICY "student_book_targets_update" ON public.student_book_targets
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(student_book_targets.workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- video_watch_marks
-- ============================================================
DROP POLICY IF EXISTS "video_watch_marks_select" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_select" ON public.video_watch_marks
  FOR SELECT USING (
    (SELECT public.has_workspace_role(video_watch_marks.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS "video_watch_marks_insert" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_insert" ON public.video_watch_marks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND sba.workspace_id = video_watch_marks.workspace_id
        AND (
          (SELECT public.has_workspace_role(video_watch_marks.workspace_id, ARRAY['owner', 'teacher']))
          OR public.is_student_self(sba.student_id)
        )
    )
  );

DROP POLICY IF EXISTS "video_watch_marks_delete" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_delete" ON public.video_watch_marks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.student_book_assignments sba
      WHERE sba.id = video_watch_marks.student_book_assignment_id
        AND sba.workspace_id = video_watch_marks.workspace_id
        AND (
          (SELECT public.has_workspace_role(video_watch_marks.workspace_id, ARRAY['owner', 'teacher']))
          OR public.is_student_self(sba.student_id)
        )
    )
  );

-- ============================================================
-- weekly_plan_drafts / weekly_plan_draft_items
-- ============================================================
DROP POLICY IF EXISTS "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts;
CREATE POLICY "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts
  FOR SELECT USING (
    teacher_profile_id = public.current_profile_id()
    AND (SELECT public.has_workspace_role(weekly_plan_drafts.workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items;
CREATE POLICY "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan_drafts d
      WHERE d.id = weekly_plan_draft_items.draft_id
        AND d.teacher_profile_id = public.current_profile_id()
        AND (SELECT public.has_workspace_role(d.workspace_id, ARRAY['owner', 'teacher']))
    )
  );

-- ============================================================
-- support_messages
-- ============================================================
DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select" ON public.support_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (SELECT public.has_workspace_role(t.workspace_id, ARRAY['owner', 'teacher']))
    )
  );

-- ============================================================
-- workspace_members / workspaces
-- ============================================================
DROP POLICY IF EXISTS "wm_insert_owner" ON public.workspace_members;
CREATE POLICY "wm_insert_owner" ON public.workspace_members
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(workspace_members.workspace_id, ARRAY['owner']))
  );

DROP POLICY IF EXISTS "wm_update_owner" ON public.workspace_members;
CREATE POLICY "wm_update_owner" ON public.workspace_members
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspace_members.workspace_id, ARRAY['owner']))
  );

DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspaces.id, ARRAY['owner']))
  );
