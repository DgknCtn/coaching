-- PANEL SORGU PLANI (B13) — YALNIZ OKUR, HİÇBİR ŞEY YAZMAZ.
--
-- Supabase SQL Editor'de çalıştırılır. Sorguyu B test öğretmeninin
-- (burak@test.com) kimliğiyle, RLS DAHİL açıklar: uygulama tam olarak bu
-- rol ve bu kimlikle sorguluyor. `set local` yalnız bu çalıştırma için
-- geçerli, oturum kapanınca kaybolur.
--
-- Çıktının tamamını (QUERY PLAN sütunu) kopyalayıp Claude'a verin.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b566cda4-4a09-4c8f-9fb8-a01f80817cc9","role":"authenticated"}',
  true
);

explain (analyze, buffers, format text)
select *
from public.teacher_student_operation_view
where workspace_id = '4e4052f6-171e-4a19-89db-eb29e4010e33';
