-- ============================================================
-- 092_rls_workspace_set_rollout — 091'in deseni tüm politikalara
-- ============================================================
--
-- 091 TEK TABLODA denendi ve ölçüldü. `homework_items` politikasındaki
-- korelasyonlu SubPlan, satırdan bağımsız bir küme aramasına çevrildi.
-- Aynı sayfa, aynı veri, tek değişiklik:
--
--   /teacher/students — TEK yükleme
--                       091 öncesi   091 sonrası
--     profiles              13.462        7.891   (%41 düşüş)
--     workspace_members     13.373        7.802   (%42 düşüş)
--     sayfa süresi         8.015 ms     4.837 ms
--
--   üç koşunun ortancası:
--     /teacher            3.298 ms  →  1.115 ms
--     /teacher/students   7.306 ms  →  4.545 ms
--
-- Hipotez doğrulandı: kalan maliyet, aynı deseni kullanan diğer
-- politikalarda. Bu dosya deseni geri kalan 73 politikaya yayıyor.
--
-- ============================================================
-- DÖNÜŞÜM MEKANİK VE ANLAM KORUYUCU
-- ============================================================
--   (SELECT has_workspace_role(X, R))   ->   X IN (SELECT my_workspace_ids(R))
--
-- İkisi mantıksal olarak aynı: my_workspace_ids, has_workspace_role ile
-- BİREBİR aynı koşulları kullanıyor (aktif üyelik, aktif çalışma alanı,
-- rol eşleşmesi) — yalnız yön değişiyor: "bu alan bana açık mı" yerine
-- "bana açık alanlar hangileri, bu onlardan biri mi".
--
-- Planlayıcı için fark: alt sorgu artık satırın sütununa BAĞLI DEĞİL.
-- Korelasyonsuz bir alt sorgu InitPlan olur, sorgu başına bir kez
-- çalışır ve satır başına yapılan iş bir hash aramasına iner.
--
-- Politikaların şu anki hâli CANLI VERİTABANINDAN (pg_policies) okundu
-- ve dönüşüm elle değil, parantez dengeleyen bir ayrıştırıcıyla
-- yapıldı — 92 alanın 92'si de dönüştü, elle düzeltilen tek satır yok.
-- Öğrenci/veli dalları (is_student_self, is_parent_of_student) OLDUĞU
-- GİBİ duruyor: ölçüm onların suçlu olmadığını gösterdi (students
-- sayfa başına yalnız 35 kez tarandı).
--
-- has_workspace_role KALDIRILMIYOR: uygulama kodu ve diğer RPC'ler onu
-- çağırmaya devam ediyor. Değişen yalnız RLS politikalarının ifade
-- biçimi.
--
-- Yeniden çalıştırılabilir: her CREATE POLICY öncesinde DROP IF EXISTS.
-- ============================================================


-- ---------- academic_notes ----------
DROP POLICY IF EXISTS "academic_notes_delete_teacher" ON public.academic_notes;
CREATE POLICY "academic_notes_delete_teacher" ON public.academic_notes
  FOR DELETE
  USING (academic_notes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "academic_notes_insert_teacher" ON public.academic_notes;
CREATE POLICY "academic_notes_insert_teacher" ON public.academic_notes
  FOR INSERT
  WITH CHECK (academic_notes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "academic_notes_select_teacher" ON public.academic_notes;
CREATE POLICY "academic_notes_select_teacher" ON public.academic_notes
  FOR SELECT
  USING (academic_notes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "academic_notes_update_teacher" ON public.academic_notes;
CREATE POLICY "academic_notes_update_teacher" ON public.academic_notes
  FOR UPDATE
  USING (academic_notes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- academic_scopes ----------
DROP POLICY IF EXISTS "academic_scopes_rw" ON public.academic_scopes;
CREATE POLICY "academic_scopes_rw" ON public.academic_scopes
  FOR ALL
  USING (academic_scopes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (academic_scopes.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- academic_terms ----------
DROP POLICY IF EXISTS "terms_insert_teacher" ON public.academic_terms;
CREATE POLICY "terms_insert_teacher" ON public.academic_terms
  FOR INSERT
  WITH CHECK (academic_terms.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "terms_update_teacher" ON public.academic_terms;
CREATE POLICY "terms_update_teacher" ON public.academic_terms
  FOR UPDATE
  USING (academic_terms.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- audit_events ----------
DROP POLICY IF EXISTS "audit_events_select_teacher" ON public.audit_events;
CREATE POLICY "audit_events_select_teacher" ON public.audit_events
  FOR SELECT
  USING (audit_events.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- auth_events ----------
DROP POLICY IF EXISTS "auth_events_select_teacher" ON public.auth_events;
CREATE POLICY "auth_events_select_teacher" ON public.auth_events
  FOR SELECT
  USING (((workspace_id IS NOT NULL) AND auth_events.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))));

-- ---------- billing_orders ----------
DROP POLICY IF EXISTS "billing_orders_select" ON public.billing_orders;
CREATE POLICY "billing_orders_select" ON public.billing_orders
  FOR SELECT
  USING (billing_orders.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- book_parts ----------
DROP POLICY IF EXISTS "book_parts_select" ON public.book_parts;
CREATE POLICY "book_parts_select" ON public.book_parts
  FOR SELECT
  USING ((book_parts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.book_id = book_parts.book_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id))))) OR (( SELECT is_library_workspace(book_parts.workspace_id) AS is_library_workspace) AND ( SELECT can_read_library() AS can_read_library) AND (EXISTS ( SELECT 1 FROM books b WHERE ((b.id = book_parts.book_id) AND (b.status = 'active'::text) AND (b.library_status = 'approved'::text)))))));
DROP POLICY IF EXISTS "book_parts_write" ON public.book_parts;
CREATE POLICY "book_parts_write" ON public.book_parts
  FOR ALL
  USING (book_parts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (book_parts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- book_section_topics ----------
DROP POLICY IF EXISTS "book_section_topics_select" ON public.book_section_topics;
CREATE POLICY "book_section_topics_select" ON public.book_section_topics
  FOR SELECT
  USING ((book_section_topics.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM (book_sections bs JOIN student_book_assignments sba ON ((sba.book_id = bs.book_id))) WHERE ((bs.id = book_section_topics.section_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id)))))));
DROP POLICY IF EXISTS "book_section_topics_write" ON public.book_section_topics;
CREATE POLICY "book_section_topics_write" ON public.book_section_topics
  FOR ALL
  USING (book_section_topics.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (book_section_topics.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- book_sections ----------
DROP POLICY IF EXISTS "sections_insert_teacher" ON public.book_sections;
CREATE POLICY "sections_insert_teacher" ON public.book_sections
  FOR INSERT
  WITH CHECK (book_sections.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "sections_select" ON public.book_sections;
CREATE POLICY "sections_select" ON public.book_sections
  FOR SELECT
  USING ((book_sections.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.book_id = book_sections.book_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id))))) OR (( SELECT is_library_workspace(book_sections.workspace_id) AS is_library_workspace) AND ( SELECT can_read_library() AS can_read_library) AND (EXISTS ( SELECT 1 FROM books b WHERE ((b.id = book_sections.book_id) AND (b.status = 'active'::text) AND (b.library_status = 'approved'::text)))))));
DROP POLICY IF EXISTS "sections_update_teacher" ON public.book_sections;
CREATE POLICY "sections_update_teacher" ON public.book_sections
  FOR UPDATE
  USING (book_sections.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- book_tests ----------
DROP POLICY IF EXISTS "tests_insert_teacher" ON public.book_tests;
CREATE POLICY "tests_insert_teacher" ON public.book_tests
  FOR INSERT
  WITH CHECK (book_tests.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "tests_select" ON public.book_tests;
CREATE POLICY "tests_select" ON public.book_tests
  FOR SELECT
  USING ((book_tests.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.book_id = book_tests.book_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id))))) OR (( SELECT is_library_workspace(book_tests.workspace_id) AS is_library_workspace) AND ( SELECT can_read_library() AS can_read_library) AND (EXISTS ( SELECT 1 FROM books b WHERE ((b.id = book_tests.book_id) AND (b.status = 'active'::text) AND (b.library_status = 'approved'::text)))))));
DROP POLICY IF EXISTS "tests_update_teacher" ON public.book_tests;
CREATE POLICY "tests_update_teacher" ON public.book_tests
  FOR UPDATE
  USING (book_tests.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- books ----------
DROP POLICY IF EXISTS "books_insert_teacher" ON public.books;
CREATE POLICY "books_insert_teacher" ON public.books
  FOR INSERT
  WITH CHECK (books.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "books_select" ON public.books;
CREATE POLICY "books_select" ON public.books
  FOR SELECT
  USING ((books.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.book_id = books.id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id))))) OR ((status = 'active'::text) AND (library_status = 'approved'::text) AND ( SELECT is_library_workspace(books.workspace_id) AS is_library_workspace) AND ( SELECT can_read_library() AS can_read_library))));
DROP POLICY IF EXISTS "books_update_teacher" ON public.books;
CREATE POLICY "books_update_teacher" ON public.books
  FOR UPDATE
  USING (books.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- curriculum_template_items ----------
DROP POLICY IF EXISTS "curriculum_template_items_rw" ON public.curriculum_template_items;
CREATE POLICY "curriculum_template_items_rw" ON public.curriculum_template_items
  FOR ALL
  USING (curriculum_template_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (curriculum_template_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- curriculum_templates ----------
DROP POLICY IF EXISTS "curriculum_templates_rw" ON public.curriculum_templates;
CREATE POLICY "curriculum_templates_rw" ON public.curriculum_templates
  FOR ALL
  USING (curriculum_templates.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (curriculum_templates.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- deletion_requests ----------
DROP POLICY IF EXISTS "deletion_requests_select" ON public.deletion_requests;
CREATE POLICY "deletion_requests_select" ON public.deletion_requests
  FOR SELECT
  USING (deletion_requests.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- finance_lessons ----------
DROP POLICY IF EXISTS "finance_lessons_owner" ON public.finance_lessons;
CREATE POLICY "finance_lessons_owner" ON public.finance_lessons
  FOR ALL
  USING (finance_lessons.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])))
  WITH CHECK (finance_lessons.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- finance_payments ----------
DROP POLICY IF EXISTS "finance_payments_owner" ON public.finance_payments;
CREATE POLICY "finance_payments_owner" ON public.finance_payments
  FOR ALL
  USING (finance_payments.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])))
  WITH CHECK (finance_payments.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- group_sessions ----------
DROP POLICY IF EXISTS "group_sessions_rw" ON public.group_sessions;
CREATE POLICY "group_sessions_rw" ON public.group_sessions
  FOR ALL
  USING (group_sessions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (group_sessions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- homework_batches ----------
DROP POLICY IF EXISTS "hb_insert_teacher" ON public.homework_batches;
CREATE POLICY "hb_insert_teacher" ON public.homework_batches
  FOR INSERT
  WITH CHECK (homework_batches.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "hb_select" ON public.homework_batches;
CREATE POLICY "hb_select" ON public.homework_batches
  FOR SELECT
  USING ((homework_batches.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR is_student_self(student_id) OR is_parent_of_student(student_id)));
DROP POLICY IF EXISTS "hb_update_teacher" ON public.homework_batches;
CREATE POLICY "hb_update_teacher" ON public.homework_batches
  FOR UPDATE
  USING (homework_batches.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- homework_items ----------
DROP POLICY IF EXISTS "hi_insert_teacher" ON public.homework_items;
CREATE POLICY "hi_insert_teacher" ON public.homework_items
  FOR INSERT
  WITH CHECK (homework_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "hi_update_teacher" ON public.homework_items;
CREATE POLICY "hi_update_teacher" ON public.homework_items
  FOR UPDATE
  USING (homework_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- invitations ----------
DROP POLICY IF EXISTS "inv_insert_teacher" ON public.invitations;
CREATE POLICY "inv_insert_teacher" ON public.invitations
  FOR INSERT
  WITH CHECK (invitations.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "inv_select_teacher" ON public.invitations;
CREATE POLICY "inv_select_teacher" ON public.invitations
  FOR SELECT
  USING (invitations.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "inv_update_teacher" ON public.invitations;
CREATE POLICY "inv_update_teacher" ON public.invitations
  FOR UPDATE
  USING (invitations.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- parent_payment_notices ----------
DROP POLICY IF EXISTS "payment_notices_teacher" ON public.parent_payment_notices;
CREATE POLICY "payment_notices_teacher" ON public.parent_payment_notices
  FOR ALL
  USING (parent_payment_notices.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (parent_payment_notices.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- parent_student_links ----------
DROP POLICY IF EXISTS "psl_insert_teacher" ON public.parent_student_links;
CREATE POLICY "psl_insert_teacher" ON public.parent_student_links
  FOR INSERT
  WITH CHECK (parent_student_links.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "psl_select" ON public.parent_student_links;
CREATE POLICY "psl_select" ON public.parent_student_links
  FOR SELECT
  USING ((parent_student_links.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (parent_profile_id = current_profile_id())));
DROP POLICY IF EXISTS "psl_update_teacher" ON public.parent_student_links;
CREATE POLICY "psl_update_teacher" ON public.parent_student_links
  FOR UPDATE
  USING (parent_student_links.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- service_sessions ----------
DROP POLICY IF EXISTS "service_sessions_rw" ON public.service_sessions;
CREATE POLICY "service_sessions_rw" ON public.service_sessions
  FOR ALL
  USING (service_sessions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (service_sessions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_book_assignments ----------
DROP POLICY IF EXISTS "sba_insert_teacher" ON public.student_book_assignments;
CREATE POLICY "sba_insert_teacher" ON public.student_book_assignments
  FOR INSERT
  WITH CHECK (student_book_assignments.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "sba_select" ON public.student_book_assignments;
CREATE POLICY "sba_select" ON public.student_book_assignments
  FOR SELECT
  USING ((student_book_assignments.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR is_student_self(student_id) OR is_parent_of_student(student_id)));
DROP POLICY IF EXISTS "sba_update_teacher" ON public.student_book_assignments;
CREATE POLICY "sba_update_teacher" ON public.student_book_assignments
  FOR UPDATE
  USING (student_book_assignments.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_book_targets ----------
DROP POLICY IF EXISTS "student_book_targets_insert" ON public.student_book_targets;
CREATE POLICY "student_book_targets_insert" ON public.student_book_targets
  FOR INSERT
  WITH CHECK ((student_book_targets.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])) AND (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.id = student_book_targets.student_book_assignment_id) AND (sba.workspace_id = student_book_targets.workspace_id))))));
DROP POLICY IF EXISTS "student_book_targets_select" ON public.student_book_targets;
CREATE POLICY "student_book_targets_select" ON public.student_book_targets
  FOR SELECT
  USING ((student_book_targets.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.id = student_book_targets.student_book_assignment_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id)))))));
DROP POLICY IF EXISTS "student_book_targets_update" ON public.student_book_targets;
CREATE POLICY "student_book_targets_update" ON public.student_book_targets
  FOR UPDATE
  USING (student_book_targets.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_curriculum_items ----------
DROP POLICY IF EXISTS "student_curriculum_items_rw" ON public.student_curriculum_items;
CREATE POLICY "student_curriculum_items_rw" ON public.student_curriculum_items
  FOR ALL
  USING (student_curriculum_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (student_curriculum_items.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_fees ----------
DROP POLICY IF EXISTS "student_fees_owner" ON public.student_fees;
CREATE POLICY "student_fees_owner" ON public.student_fees
  FOR ALL
  USING (student_fees.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])))
  WITH CHECK (student_fees.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- student_groups ----------
DROP POLICY IF EXISTS "student_groups_rw" ON public.student_groups;
CREATE POLICY "student_groups_rw" ON public.student_groups
  FOR ALL
  USING (student_groups.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (student_groups.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_services ----------
DROP POLICY IF EXISTS "student_services_rw" ON public.student_services;
CREATE POLICY "student_services_rw" ON public.student_services
  FOR ALL
  USING (student_services.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (student_services.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- student_topic_overrides ----------
DROP POLICY IF EXISTS "student_topic_overrides_rw" ON public.student_topic_overrides;
CREATE POLICY "student_topic_overrides_rw" ON public.student_topic_overrides
  FOR ALL
  USING (student_topic_overrides.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (student_topic_overrides.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- students ----------
DROP POLICY IF EXISTS "students_insert_teacher" ON public.students;
CREATE POLICY "students_insert_teacher" ON public.students
  FOR INSERT
  WITH CHECK (students.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT
  USING ((students.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR is_student_self(id) OR is_parent_of_student(id)));
DROP POLICY IF EXISTS "students_update_teacher" ON public.students;
CREATE POLICY "students_update_teacher" ON public.students
  FOR UPDATE
  USING (students.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- support_messages ----------
DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select" ON public.support_messages
  FOR SELECT
  USING ((EXISTS ( SELECT 1 FROM support_tickets t WHERE ((t.id = support_messages.ticket_id) AND t.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))))));

-- ---------- support_tickets ----------
DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
CREATE POLICY "support_tickets_select" ON public.support_tickets
  FOR SELECT
  USING (support_tickets.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- test_completions ----------
DROP POLICY IF EXISTS "tc_insert_teacher" ON public.test_completions;
CREATE POLICY "tc_insert_teacher" ON public.test_completions
  FOR INSERT
  WITH CHECK (test_completions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));
DROP POLICY IF EXISTS "tc_select" ON public.test_completions;
CREATE POLICY "tc_select" ON public.test_completions
  FOR SELECT
  USING ((test_completions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR is_student_self(student_id) OR is_parent_of_student(student_id)));
DROP POLICY IF EXISTS "tc_update_teacher" ON public.test_completions;
CREATE POLICY "tc_update_teacher" ON public.test_completions
  FOR UPDATE
  USING (test_completions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- topic_contacts ----------
DROP POLICY IF EXISTS "topic_contacts_rw" ON public.topic_contacts;
CREATE POLICY "topic_contacts_rw" ON public.topic_contacts
  FOR ALL
  USING (topic_contacts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (topic_contacts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- topics ----------
DROP POLICY IF EXISTS "topics_rw" ON public.topics;
CREATE POLICY "topics_rw" ON public.topics
  FOR ALL
  USING (topics.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (topics.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- usage_counters ----------
DROP POLICY IF EXISTS "usage_counters_select" ON public.usage_counters;
CREATE POLICY "usage_counters_select" ON public.usage_counters
  FOR SELECT
  USING (usage_counters.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- video_watch_marks ----------
DROP POLICY IF EXISTS "video_watch_marks_delete" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_delete" ON public.video_watch_marks
  FOR DELETE
  USING ((EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.id = video_watch_marks.student_book_assignment_id) AND (sba.workspace_id = video_watch_marks.workspace_id) AND (video_watch_marks.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])) OR is_student_self(sba.student_id))))));
DROP POLICY IF EXISTS "video_watch_marks_insert" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_insert" ON public.video_watch_marks
  FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.id = video_watch_marks.student_book_assignment_id) AND (sba.workspace_id = video_watch_marks.workspace_id) AND (video_watch_marks.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])) OR is_student_self(sba.student_id))))));
DROP POLICY IF EXISTS "video_watch_marks_select" ON public.video_watch_marks;
CREATE POLICY "video_watch_marks_select" ON public.video_watch_marks
  FOR SELECT
  USING ((video_watch_marks.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text, 'assistant'::text])) OR (EXISTS ( SELECT 1 FROM student_book_assignments sba WHERE ((sba.id = video_watch_marks.student_book_assignment_id) AND (is_student_self(sba.student_id) OR is_parent_of_student(sba.student_id)))))));

-- ---------- weekly_flows ----------
DROP POLICY IF EXISTS "weekly_flows_rw" ON public.weekly_flows;
CREATE POLICY "weekly_flows_rw" ON public.weekly_flows
  FOR ALL
  USING (weekly_flows.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (weekly_flows.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- ---------- weekly_plan_draft_items ----------
DROP POLICY IF EXISTS "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items;
CREATE POLICY "weekly_plan_draft_items_select_own" ON public.weekly_plan_draft_items
  FOR SELECT
  USING ((EXISTS ( SELECT 1 FROM weekly_plan_drafts d WHERE ((d.id = weekly_plan_draft_items.draft_id) AND (d.teacher_profile_id = current_profile_id()) AND d.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))))));

-- ---------- weekly_plan_drafts ----------
DROP POLICY IF EXISTS "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts;
CREATE POLICY "weekly_plan_drafts_select_own" ON public.weekly_plan_drafts
  FOR SELECT
  USING (((teacher_profile_id = current_profile_id()) AND weekly_plan_drafts.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))));

-- ---------- workspace_licenses ----------
DROP POLICY IF EXISTS "workspace_licenses_select" ON public.workspace_licenses;
CREATE POLICY "workspace_licenses_select" ON public.workspace_licenses
  FOR SELECT
  USING (workspace_licenses.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- workspace_members ----------
DROP POLICY IF EXISTS "wm_insert_owner" ON public.workspace_members;
CREATE POLICY "wm_insert_owner" ON public.workspace_members
  FOR INSERT
  WITH CHECK (workspace_members.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));
DROP POLICY IF EXISTS "wm_update_owner" ON public.workspace_members;
CREATE POLICY "wm_update_owner" ON public.workspace_members
  FOR UPDATE
  USING (workspace_members.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

-- ---------- workspaces ----------
DROP POLICY IF EXISTS "workspaces_update_owner" ON public.workspaces;
CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE
  USING (workspaces.id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));
