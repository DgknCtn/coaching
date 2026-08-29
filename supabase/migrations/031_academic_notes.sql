-- ============================================================
-- 031_academic_notes  (R6-07)
--
-- Eğitmen, özellikle yüz yüze derslerde derse başlarken WhatsApp grubunu
-- açıp en son ödevi, işlenen yeri ve öğrencinin sorununu hatırlıyor.
-- Öğrenci sayısı ve koçluk/grup modeli arttıkça bu yöntem kırılgan.
--
-- NEDEN YENİ TABLO
-- students.notes tek bir TEXT alanı: tarih yok, yazar yok, birden fazla
-- not yok, "önemli" işareti yok. Öğrenci hafızası KRONOLOJİK olmak
-- zorunda ("geçen hafta ne oldu, nerede kaldık"). Tek alanı genişletmek
-- bu ihtiyacı karşılamıyor; bu, R6'nın "mevcut yapıyı genişlet" kuralının
-- geçerli bir istisnası.
--
-- students.notes DÜŞÜRÜLMEZ. İçeriği ilk akademik nota taşınır ama kolon
-- yerinde kalır — migration geri alınabilir olsun ve mevcut veri hiçbir
-- durumda kaybolmasın.
--
-- GİZLİLİK — BU MADDENİN EN KRİTİK KISMI
-- Bu bir "veli notu" DEĞİLDİR. Amaç eğitmenin kişisel öğrenci hafızasını
-- sistemde tutmak. Öğrenci ve veli için RLS politikası HİÇ YAZILMAZ:
-- RLS açık ve politika yoksa erişim yoktur. Bu, "yanlışlıkla expose etme"
-- riskini şemadan kaldırır — bir sorgu yanlışlıkla bu tabloyu join etse
-- bile öğrenci/veli oturumunda boş döner.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.academic_notes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note_text         TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  -- "Önemli / Sabit": listenin başında kalması istenen kalıcı bilgi
  -- ("disleksi var", "sınav kaygısı yüksek", "salı akşamları çalışamıyor").
  pinned            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Öğrenci detayında "son not" ve Notlar sekmesinde kronolojik liste;
-- ikisi de bu indeksten beslenir.
CREATE INDEX IF NOT EXISTS idx_academic_notes_student
  ON public.academic_notes (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_academic_notes_workspace
  ON public.academic_notes (workspace_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.academic_notes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.academic_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- RLS — yalnız owner/teacher
--
-- 026'daki desen: yardımcı çağrı alt sorguya sarılır ki planlayıcı onu
-- satır başına değil sorgu başına bir kez değerlendirsin.
--
-- Öğrenci veya veli için politika YOKTUR ve eklenmemelidir.
-- ============================================================
ALTER TABLE public.academic_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_notes_select_teacher ON public.academic_notes;
CREATE POLICY academic_notes_select_teacher ON public.academic_notes
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS academic_notes_insert_teacher ON public.academic_notes;
CREATE POLICY academic_notes_insert_teacher ON public.academic_notes
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS academic_notes_update_teacher ON public.academic_notes;
CREATE POLICY academic_notes_update_teacher ON public.academic_notes
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS academic_notes_delete_teacher ON public.academic_notes;
CREATE POLICY academic_notes_delete_teacher ON public.academic_notes
  FOR DELETE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

-- ============================================================
-- Mevcut students.notes içeriğini taşı
--
-- Yalnız DOLU olanlar ve yalnız BİR KEZ: tekrar çalıştırıldığında aynı
-- notu ikinci kez oluşturmaz (migration'ın idempotent olması gerekir).
-- author_profile_id bilinmiyor; NULL bırakılır ve "Sistem" olarak okunur.
-- ============================================================
INSERT INTO public.academic_notes (workspace_id, student_id, author_profile_id, note_text, created_at)
SELECT s.workspace_id, s.id, NULL, btrim(s.notes), s.created_at
FROM public.students s
WHERE s.notes IS NOT NULL
  AND btrim(s.notes) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.academic_notes an WHERE an.student_id = s.id
  );

-- ============================================================
-- RPC'ler
--
-- Projenin kuralı: tüm yazma yolları SECURITY DEFINER RPC'den geçer.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_academic_note(
  p_student_id UUID,
  p_note_text  TEXT,
  p_pinned     BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_note_id      UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_note_text IS NULL OR btrim(p_note_text) = '' THEN
    RAISE EXCEPTION 'Not boş olamaz';
  END IF;

  INSERT INTO public.academic_notes (
    workspace_id, student_id, author_profile_id, note_text, pinned
  ) VALUES (
    v_workspace_id, p_student_id, public.current_profile_id(),
    btrim(p_note_text), COALESCE(p_pinned, FALSE)
  ) RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('note_id', v_note_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_academic_note_pinned(
  p_note_id UUID,
  p_pinned  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.academic_notes WHERE id = p_note_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Not bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.academic_notes
  SET pinned = COALESCE(p_pinned, FALSE)
  WHERE id = p_note_id;

  RETURN jsonb_build_object('note_id', p_note_id, 'pinned', COALESCE(p_pinned, FALSE));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_academic_note(
  p_note_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.academic_notes WHERE id = p_note_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Not bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.academic_notes WHERE id = p_note_id;

  RETURN jsonb_build_object('deleted', TRUE);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.add_academic_note(UUID, TEXT, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_academic_note_pinned(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.delete_academic_note(UUID);
--   DROP TABLE IF EXISTS public.academic_notes;
--
-- students.notes'a dokunulmadığı için geri alma sonrası eski tek-alanlı
-- not olduğu gibi yerinde durur; veri kaybı olmaz.
-- ============================================================
