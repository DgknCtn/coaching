-- ============================================================
-- 035_section_grouping  (R6-17)
--
-- MÖF testinde fasikül + tema bilgisi "F1|T1:Sayılar" gibi geçici bölüm
-- isimleriyle TEK BİR STRING içinde taşındı. Bu çalıştı ama filtrelenebilir
-- veya yeniden adlandırılabilir değil.
--
-- TASARIM KARARI: fasikül ve tema için ayrı TABLOLAR açılmaz.
--
-- Neden: MatMüh'ün takip birimi geniş akademik konu/bölüm düzeyinde kalmalı.
-- Yayın içindeki her mikro başlığı zorunlu bir konu yapısına çevirmek,
-- kitap ekleme akışını kullanılamaz hale getirirdi. Tema BİR TAKİP BİRİMİ
-- DEĞİLDİR; üst grup METADATA'sıdır. Metadata için iki nullable kolon
-- yeterlidir ve mevcut Kaynak > Bölüm > Test yapısını hiç değiştirmez.
--
-- HER İKİ ALAN DA OPSİYONELDİR: klasik bir TYT kitabı tema/fasikül
-- girilmeden kaydedilebilir ve akış hiç ağırlaşmaz (kabul #87).
--
-- SAYFA BENZERSİZLİĞİ DEĞİŞMEZ: sayfa kimliği section_id + sayfa numarası
-- bağlamındadır (022: her sayfa ayrı book_tests satırı, section_id'ye
-- bağlı). F2 sf.5 ile F3 sf.5 AYRI fiziksel sayfalardır ve bu kural bu
-- migration'dan bağımsız olarak zaten geçerlidir (kabul #89).
--
-- TEMA ADI DEĞİŞİMİ COMPLETION'LARI ETKİLEMEZ (kabul #90): bunlar serbest
-- metin ETİKETLERİDİR, ilişki taşımazlar. test_completions book_test_id'ye
-- bağlıdır; etiketi değiştirmek hiçbir kaydı taşımaz.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.book_sections
  -- Fasikül / kitapçık: "F1", "F2 · Nicelikler ve Değişimler"
  ADD COLUMN IF NOT EXISTS group_label TEXT,
  -- Tema (TYMM üst başlığı): "T2 Nicelikler ve Değişimler"
  ADD COLUMN IF NOT EXISTS theme_label TEXT;

COMMENT ON COLUMN public.book_sections.group_label IS
  'R6-17: opsiyonel fasikül/kitapçık etiketi. Takip birimi DEĞİLDİR, '
  'yalnız üst grup metadata''sıdır.';

COMMENT ON COLUMN public.book_sections.theme_label IS
  'R6-17: opsiyonel TYMM tema etiketi. Takip birimi DEĞİLDİR.';

-- Fasiküle göre gruplu görünüm için; kolonlar boşken maliyeti yok.
CREATE INDEX IF NOT EXISTS idx_book_sections_grouping
  ON public.book_sections (book_id, group_label)
  WHERE group_label IS NOT NULL;

-- ============================================================
-- set_section_grouping
--
-- Bölümün fasikül/tema etiketlerini günceller. Ayrı bir RPC, çünkü bölüm
-- yeniden adlandırma (018: rename_book_section) farklı bir işlemdir ve
-- etiket değişimi başlığı değiştirmemeli.
--
-- Boş string NULL'a çevrilir: "temizlemek" ile "boş metin yazmak" arasında
-- fark olmamalı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_section_grouping(
  p_section_id  UUID,
  p_group_label TEXT DEFAULT NULL,
  p_theme_label TEXT DEFAULT NULL
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

  UPDATE public.book_sections
  SET group_label = NULLIF(TRIM(COALESCE(p_group_label, '')), ''),
      theme_label = NULLIF(TRIM(COALESCE(p_theme_label, '')), ''),
      updated_at  = NOW()
  WHERE id = p_section_id;

  RETURN jsonb_build_object('section_id', p_section_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_section_grouping(UUID, TEXT, TEXT);
--   DROP INDEX IF EXISTS public.idx_book_sections_grouping;
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS theme_label;
--   ALTER TABLE public.book_sections DROP COLUMN IF EXISTS group_label;
--
-- Geri alma yalnız metadata etiketlerini kaldırır; bölümler, testler ve
-- tamamlanma kayıtları hiç etkilenmez.
-- ============================================================
