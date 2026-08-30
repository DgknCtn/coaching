-- ============================================================
-- 040_book_section_topic  (R5.3 — Müfredat <-> Kitap Bağlantısı)
--
-- AMAÇ: Öğrencinin kişisel akışında "Zamanı Geldi" olan canonical topic'i
-- atanmış kitaplarda YALNIZ GÖRSEL BİR ZAMAN SİNYALİ olarak göstermek.
--
--   student_curriculum_items.topic_id
--            |
--       canonical topic
--            |
--     book_sections.topic_id
--
-- MAPPING GLOBALDİR, ÖĞRENCİYE ÖZEL DEĞİLDİR (§5.1). "345 Matematik'in
-- Polinomlar bölümü = TYT Matematik/Polinomlar topic'i" ifadesi kitabın
-- yapısal bilgisidir; hangi öğrencinin o kitabı çalıştığından bağımsızdır.
-- Bu yüzden student_book_assignments'a değil book_sections'a yazılır.
--
-- NULLABLE VE ÖYLE KALACAK (§5.1): mevcut yüzlerce bölüm kaydı eşlemesiz.
-- Eşlemesi olmayan bölüm R4'te SORUNSUZ çalışır, yalnız müfredat sinyali
-- alamaz (MK-06). Eşleme zorunlu tutulsaydı, tek bir yeni alan yüzünden
-- çalışan kitap havuzu kullanılamaz hale gelirdi.
--
-- İSİMLE DEĞİL ID İLE (§8.3, MK-07): "Fonksiyonlar" hem TYT Matematik'te
-- hem AYT Matematik'te olabilir ve bunlar AYRI topic'lerdir. Bağ topic_id
-- ile kurulduğu için yanlış scope'un sinyali sızamaz.
--
-- ON DELETE SET NULL: bir topic silinirse kitap bölümü ayakta kalır ve
-- yalnız sinyalini kaybeder. Kitap yapısı müfredat verisine bağımlı
-- olmamalı.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.book_sections
  ADD COLUMN IF NOT EXISTS topic_id UUID
    REFERENCES public.topics(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.book_sections.topic_id IS
  'R5.3: bölümün bağlandığı canonical topic. Global kitap bilgisidir, '
  'öğrenciye özel değildir. NULL olabilir; eşlemesiz bölüm R4''te normal '
  'çalışır, yalnız müfredat sinyali almaz.';

-- Sinyal sorgusu "bu kitabın bölümlerinin topic'leri" üzerinden gider.
CREATE INDEX IF NOT EXISTS idx_book_sections_topic
  ON public.book_sections (topic_id)
  WHERE topic_id IS NOT NULL;

-- ============================================================
-- set_book_section_topic
--
-- Eşlemeyi kuran/kaldıran tek giriş noktası.
--
-- p_topic_id NULL gönderilirse eşleme KALDIRILIR — bölüm R4 davranışına
-- döner. Bu bilinçli olarak mümkün: yanlış eşleme yapıldığında geri
-- alınabilmeli.
--
-- Topic'in kitapla aynı workspace'te olduğu doğrulanır; başka bir
-- workspace'in topic'ine bağlanamaz.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_book_section_topic(
  p_section_id UUID,
  p_topic_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.book_sections WHERE id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_topic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.id = p_topic_id AND t.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Konu bulunamadı';
  END IF;

  UPDATE public.book_sections
  SET topic_id = p_topic_id, updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id, 'topic_id', p_topic_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_book_section_topic(UUID, UUID);
--   DROP INDEX IF EXISTS public.idx_book_sections_topic;
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS topic_id;
--
-- Geri alma yalnız eşlemeyi siler. Kitaplar, bölümler, testler, ödevler
-- ve tamamlanma kayıtlarının hiçbirine dokunmaz; sistem R5.3 öncesi
-- davranışına döner.
-- ============================================================
