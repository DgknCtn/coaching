-- ============================================================
-- 043_book_section_topics  (R7-02 §8)
--
-- "Bir bölüm birden fazla müfredat konusuna bağlanabiliyor." (kabul #9)
--
-- 040'ta bağ TEK bir kolondu: book_sections.topic_id. Gerçek kitaplarda bir
-- bölüm çoğu zaman birden fazla konuya karşılık geliyor ("Rasyonel Sayılar"
-- bölümü hem Rasyonel Sayılar hem Ondalık Gösterim).
--
-- TASARIM KARARI: 040'ın kolonu KALDIRILMAZ.
--
-- Neden: R5.3 müfredat sinyali (lib/curriculum-signal.ts, book_sections
-- sorguları) o kolondan okuyor ve çalışıyor. Kolonu kaldırmak işleyen bir
-- sinyali kırar. Bunun yerine kolon BİRİNCİL EŞLEME olarak kalır ve bu
-- migration'daki RPC her yazmada listenin ilk elemanıyla senkron tutar.
-- Böylece:
--   * mevcut sinyal davranışı bire bir korunur,
--   * çoklu eşleme yeni tabloda tam olarak durur,
--   * tek eşlemeli kayıtlar için iki kaynak da aynı şeyi söyler.
--
-- EŞLEME ZORUNLU DEĞİLDİR (§8): eşlemesiz bölüm R4'te sorunsuz çalışır,
-- yalnız müfredat sinyali almaz. Kitabı kaydetmek için eşleme aranmaz.
--
-- BÖLÜMÜN TAMAMLANMASI KONUYU 'ÖĞRENİLDİ' YAPMAZ (§8): bu tablo yalnız
-- "hangi konu bu kaynakta nereye denk geliyor?" sorusunu yanıtlar.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.book_section_topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES public.book_sections(id) ON DELETE CASCADE,
  topic_id     UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aynı bölüm-konu çifti iki kez yazılamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_book_section_topic
  ON public.book_section_topics (section_id, topic_id);

CREATE INDEX IF NOT EXISTS idx_book_section_topics_topic
  ON public.book_section_topics (topic_id);

COMMENT ON TABLE public.book_section_topics IS
  'R7-02 §8: kitap bölümü <-> canonical topic çoklu eşlemesi. Global kitap '
  'bilgisidir, öğrenciye özel değildir. book_sections.topic_id birincil '
  'eşleme olarak senkron tutulur (040 sinyali bozulmasın diye).';

-- RLS: eşleme eğitmen bilgisidir; okuma öğrenci/veliye de açıktır çünkü
-- harita sinyali onların ekranında da görünür (026/040 deseni).
ALTER TABLE public.book_section_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_section_topics_select ON public.book_section_topics;
CREATE POLICY book_section_topics_select ON public.book_section_topics
  FOR SELECT USING (
    (SELECT public.has_workspace_role(book_section_topics.workspace_id, ARRAY['owner', 'teacher', 'assistant']))
    OR EXISTS (
      SELECT 1
      FROM public.book_sections bs
      JOIN public.student_book_assignments sba ON sba.book_id = bs.book_id
      WHERE bs.id = book_section_topics.section_id
        AND (public.is_student_self(sba.student_id) OR public.is_parent_of_student(sba.student_id))
    )
  );

DROP POLICY IF EXISTS book_section_topics_write ON public.book_section_topics;
CREATE POLICY book_section_topics_write ON public.book_section_topics
  FOR ALL
  USING ((SELECT public.has_workspace_role(book_section_topics.workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(book_section_topics.workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- set_book_section_topics
--
-- Bölümün TÜM eşlemelerini tek çağrıda yazar (replace semantiği). Boş dizi
-- gönderilirse eşleme kaldırılır ve bölüm R4 davranışına döner — 040'ın
-- "yanlış eşleme geri alınabilmeli" ilkesi korunur.
--
-- Her topic kitapla aynı workspace'te olmalıdır; başka bir workspace'in
-- konusuna bağlanamaz.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_book_section_topics(
  p_section_id UUID,
  p_topic_ids  UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_primary      UUID;
  v_count        INT := 0;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.book_sections WHERE id = p_section_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Bölüm bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_topic_ids IS NOT NULL AND array_length(p_topic_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_topic_ids) AS wanted(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.topics t
        WHERE t.id = wanted.id AND t.workspace_id = v_workspace_id
      )
    ) THEN
      RAISE EXCEPTION 'Konu bulunamadı';
    END IF;
  END IF;

  DELETE FROM public.book_section_topics WHERE section_id = p_section_id;

  IF p_topic_ids IS NOT NULL AND array_length(p_topic_ids, 1) > 0 THEN
    INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
    SELECT v_workspace_id, p_section_id, t.id, t.ord
    FROM unnest(p_topic_ids) WITH ORDINALITY AS t(id, ord)
    ON CONFLICT (section_id, topic_id) DO NOTHING;

    v_primary := p_topic_ids[1];
    v_count   := array_length(p_topic_ids, 1);
  END IF;

  -- 040 uyumu: birincil eşleme kolonu listenin ilk elemanıyla senkron.
  -- Liste boşsa kolon da temizlenir; sinyal kaybolur, kitap çalışmaya
  -- devam eder.
  UPDATE public.book_sections
  SET topic_id = v_primary, updated_at = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object(
    'section_id', p_section_id,
    'topic_count', v_count,
    'primary_topic_id', v_primary
  );
END;
$fn$;

-- ============================================================
-- Mevcut tek eşlemeleri yeni tabloya taşı (idempotent)
--
-- 040 ile kurulmuş eşlemeler kaybolmamalı. Kolon zaten senkron tutulduğu
-- için burada yalnız yeni tabloya kopyalanır; hiçbir kolon temizlenmez.
-- ============================================================
INSERT INTO public.book_section_topics (workspace_id, section_id, topic_id, sort_order)
SELECT bs.workspace_id, bs.id, bs.topic_id, 1
FROM public.book_sections bs
WHERE bs.topic_id IS NOT NULL
ON CONFLICT (section_id, topic_id) DO NOTHING;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_book_section_topics(UUID, UUID[]);
--   DROP TABLE IF EXISTS public.book_section_topics;
--
-- Geri alma yalnız çoklu eşlemeyi kaldırır. book_sections.topic_id ve
-- onunla çalışan R5.3 sinyali yerinde kalır; sistem 040 davranışına döner.
-- ============================================================
