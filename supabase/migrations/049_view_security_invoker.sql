-- ============================================================
-- 049_view_security_invoker  —  P0 GÜVENLİK
--
-- KİRACILAR ARASI VERİ SIZINTISININ KAPATILMASI.
--
-- SORUN
--
-- Depodaki sekiz view'ın hiçbirinde `security_invoker` yoktu ve hiçbirinde
-- GRANT/REVOKE tanımı yoktu. PostgreSQL'de bir view VARSAYILAN OLARAK
-- sahibinin haklarıyla çalışır ve alttaki tabloların RLS politikalarını
-- tamamen atlar; Supabase de `public` şemasındaki nesnelere `anon` ve
-- `authenticated` rolleri için varsayılan SELECT izni verir.
--
-- Sonuç: tarayıcıda zaten görünen anon anahtarıyla
--
--     GET /rest/v1/teacher_student_overview_view?select=*
--
-- çağıran herhangi biri, SİSTEMDEKİ TÜM WORKSPACE'LERİN öğrenci adlarını,
-- sınav türlerini, ilerleme yüzdelerini ve risk durumlarını okuyabiliyordu.
-- 003, 026 ve 046'daki tüm RLS çalışması bu yolla aşılıyordu.
--
-- ÇÖZÜM: iki katman, ikisi de gerekli
--
--   1. security_invoker = on  →  view artık ÇAĞIRANIN haklarıyla çalışır,
--      yani alttaki tabloların RLS politikaları devreye girer.
--   2. REVOKE anon / GRANT authenticated  →  oturum açmamış istemci
--      view'a hiç erişemez. RLS zaten satırları süzer ama erişimi de
--      kesmek savunmanın ikinci katmanıdır: yarın bir tabloya yanlışlıkla
--      gevşek bir politika yazılırsa anon yine de kapıda durur.
--
-- ZORUNLU YAN DÜZELTME: topic_contacts
--
--   student_topic_contact_view `topic_contacts` tablosunu okuyor ve o tablo
--   yalnız öğretmene açık (041). Öğrencinin "Tekrar" ekranı bugüne kadar
--   ÇALIŞIYORDU çünkü view RLS'i baypas ediyordu — yani sızıntı, eksik bir
--   politikayı örtüyordu.
--
--   046 bu tabloyu bilinçli olarak açmamıştı ("öğrencinin gördüğü son temas
--   bilgisi zaten view üzerinden geliyor" gerekçesiyle). O gerekçe artık
--   geçersiz: view kapanınca öğrenci kendi temas kaydını göremez hâle gelir
--   ve /student/review sessizce boşalır. Politika burada ekleniyor.
--
--   Kapsam yine dar: yalnız SELECT, yalnız kendi satırları. Öğrenci temas
--   YAZAMAZ — bu eğitmen kararıdır (R5.4 §6.5).
--
-- REGRESYON RİSKİ
--
--   Diğer yedi view'ın alttaki tablolarında ilgili rollerin SELECT hakkı
--   kontrol edildi ve yeterli:
--     homework_batches / homework_items / test_completions / students /
--     student_book_assignments / books / book_tests  → 003 + 026'da
--       öğretmen, is_student_self ve is_parent_of_student için açık
--     student_check_ins → can_read_student() ile üç rol için de açık (016)
--     book_sections → atanmış kitap üzerinden öğrenci/veliye açık (026)
--   Yine de her ekran yayına almadan önce elden doğrulanmalıdır.
-- ============================================================

-- ------------------------------------------------------------
-- 1) topic_contacts: öğrenci kendi temaslarını okuyabilsin
--
-- 046'daki self-SELECT kalıbının aynısı. Öğretmenin FOR ALL politikasına
-- DOKUNULMUYOR; permissive politikalar OR'lanır.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS topic_contacts_select_self ON public.topic_contacts;
CREATE POLICY topic_contacts_select_self ON public.topic_contacts
  FOR SELECT
  USING ((SELECT public.is_student_self(student_id)));

-- ------------------------------------------------------------
-- 2) Sekiz view: çağıranın haklarıyla çalış
-- ------------------------------------------------------------
ALTER VIEW public.student_book_progress_view            SET (security_invoker = on);
ALTER VIEW public.student_weekly_homework_summary_view  SET (security_invoker = on);
ALTER VIEW public.teacher_student_overview_view         SET (security_invoker = on);
ALTER VIEW public.student_overdue_homework_view         SET (security_invoker = on);
ALTER VIEW public.student_check_in_status_view          SET (security_invoker = on);
ALTER VIEW public.student_pending_approval_view         SET (security_invoker = on);
ALTER VIEW public.student_topic_contact_view            SET (security_invoker = on);
ALTER VIEW public.student_topic_open_work_view          SET (security_invoker = on);

-- ------------------------------------------------------------
-- 3) Erişimi oturum açmış kullanıcılarla sınırla
--
-- anon'un bu view'lara hiç erişmemesi gerekiyor: davet kabul akışı dahil
-- hiçbir genel sayfa view okumuyor (davet, get_invitation_by_token RPC'si
-- üzerinden çalışır).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_view TEXT;
BEGIN
  FOREACH v_view IN ARRAY ARRAY[
    'student_book_progress_view',
    'student_weekly_homework_summary_view',
    'teacher_student_overview_view',
    'student_overdue_homework_view',
    'student_check_in_status_view',
    'student_pending_approval_view',
    'student_topic_contact_view',
    'student_topic_open_work_view'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_view);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v_view);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_view);
  END LOOP;
END $$;

-- ============================================================
-- DOĞRULAMA
--
-- Anon anahtarıyla çağrıldığında artık veri DÖNMEMELİ:
--
--   curl "$SUPABASE_URL/rest/v1/teacher_student_overview_view?select=workspace_id&limit=100" \
--     -H "apikey: $ANON_KEY"
--
-- Otomatik karşılığı: tests/tenant-isolation.test.ts
--
-- ============================================================
-- ROLLBACK
--
--   ALTER VIEW ... SET (security_invoker = off);   -- sekiz view için
--   GRANT SELECT ON ... TO anon;                    -- sekiz view için
--   DROP POLICY IF EXISTS topic_contacts_select_self ON public.topic_contacts;
--
-- UYARI: geri alma, kiracılar arası sızıntıyı GERİ GETİRİR. Yalnız
-- ekranlarda düzeltilemeyen bir kırılma çıkarsa ve geçici süreyle
-- yapılmalıdır.
-- ============================================================
