-- ============================================================
-- 046_student_self_read
--
-- Öğrenci KENDİ müfredat akışını ve kendi konu durumunu okuyabilsin.
--
-- BUGÜNKÜ DURUM: 038/039/041'de kurulan tabloların hepsi `FOR ALL` +
-- teacher-only politikayla açıldı; o gün yalnız öğretmen ekranları vardı.
-- Sonuç, denetimde çıkan tuhaf bir asimetri: öğrenci kendi akademik
-- planını göremiyor ama VELİSİ haftalık özetini görebiliyor.
--
-- BU MIGRATION NE YAPAR: mevcut politikalara DOKUNMADAN, yalnızca SELECT
-- veren ayrı politikalar ekler. PostgreSQL'de aynı tablodaki permissive
-- politikalar OR'lanır; öğretmenin `FOR ALL` hakkı aynen sürer.
--
-- KAPSAM SINIRI — bilinçli:
--   * Yalnız SELECT. Öğrenci akışını düzenleyemez, temas yazamaz,
--     "Aktif Tut" işaretleyemez. Bunlar eğitmen kararıdır (R5.2 §4.4,
--     R5.4 §6.5) ve yazma yolu açılırsa o kararlar öğrenciye devredilmiş
--     olurdu.
--   * VELİYE VERİLMEZ. Veli salt okunur kalır ama kapsamı genişlemez;
--     müfredat akışı ve koruma havuzu eğitmen–öğrenci arasındadır.
--   * `topic_contacts` açılmadı: öğrencinin gördüğü "son temas" bilgisi
--     zaten `student_topic_contact_view` üzerinden geliyor.
--
-- topics / academic_scopes NEDEN AÇILIYOR: akış ekranı konu ve ders adını
-- göstermek zorunda. Bunlar öğrenciye özel veri değil, çalışma alanının
-- müfredat sözlüğüdür; öğrenci zaten aynı adları ödev ve kitap
-- ekranlarında görüyor. Yine de erişim, öğrencinin KENDİ akışında ya da
-- kendi kitaplarında geçen kayıtlarla sınırlandı — çalışma alanındaki tüm
-- müfredat sözlüğü açılmadı.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Kendi müfredat akışı (039)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS student_curriculum_items_select_self ON public.student_curriculum_items;
CREATE POLICY student_curriculum_items_select_self ON public.student_curriculum_items
  FOR SELECT
  USING ((SELECT public.is_student_self(student_id)));

-- ------------------------------------------------------------
-- 2) Kendi "Aktif Tut" override'ları (041)
--
-- Öğrenci tekrar listesinde bir konunun neden görünmediğini anlayabilmeli;
-- override bilgisi olmadan liste sebepsiz eksik görünür.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS student_topic_overrides_select_self ON public.student_topic_overrides;
CREATE POLICY student_topic_overrides_select_self ON public.student_topic_overrides
  FOR SELECT
  USING ((SELECT public.is_student_self(student_id)));

-- ------------------------------------------------------------
-- 3) Ders/kapsam adları (038)
--
-- Yalnız öğrencinin kendi akışında geçen kapsamlar.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS academic_scopes_select_student ON public.academic_scopes;
CREATE POLICY academic_scopes_select_student ON public.academic_scopes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_curriculum_items sci
      WHERE sci.scope_id = academic_scopes.id
        AND (SELECT public.is_student_self(sci.student_id))
    )
  );

-- ------------------------------------------------------------
-- 4) Konu adları (038)
--
-- İki kaynak: öğrencinin akışındaki konular ve kendisine atanmış
-- kitapların bölümlerine eşlenmiş konular (tekrar listesi bunları
-- gösteriyor).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS topics_select_student ON public.topics;
CREATE POLICY topics_select_student ON public.topics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_curriculum_items sci
      WHERE sci.topic_id = topics.id
        AND (SELECT public.is_student_self(sci.student_id))
    )
    OR EXISTS (
      SELECT 1
      FROM public.book_sections bs
      JOIN public.student_book_assignments sba ON sba.book_id = bs.book_id
      WHERE bs.topic_id = topics.id
        AND (SELECT public.is_student_self(sba.student_id))
    )
  );

-- ============================================================
-- ROLLBACK
--
--   DROP POLICY IF EXISTS student_curriculum_items_select_self ON public.student_curriculum_items;
--   DROP POLICY IF EXISTS student_topic_overrides_select_self ON public.student_topic_overrides;
--   DROP POLICY IF EXISTS academic_scopes_select_student ON public.academic_scopes;
--   DROP POLICY IF EXISTS topics_select_student ON public.topics;
--
-- Geri alma öğretmen erişimini ETKİLEMEZ; yalnız öğrenci ekranları
-- (/student/curriculum, /student/review) boş listeye düşer.
-- ============================================================
