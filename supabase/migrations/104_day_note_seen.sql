-- ============================================================
-- 104 — ÖĞRENCİ GÜNCELLEMELERİNDE "GÖRÜLDÜ" (R8 §17A)
--
-- Belge öğretmen tarafında iki akış tanımlıyor. Birincisi Öğrenci
-- Güncellemeleri: öğrencilerin yazdığı gün notları.
--
--   Buse · Salı 20:14
--   "Perşembe sınavım var, bugün ona hazırlanıyorum."
--
-- ve şu cümle: *"Bu akışta güncellemeler görüldü / görülmedi şeklinde
-- basit bir duruma sahip olabilir. HER TİK ÖĞRETMENE BİLDİRİM OLARAK
-- DÜŞMEZ."*
--
-- ============================================================
-- NEDEN BİLDİRİM DEĞİL, OKUNDU İŞARETİ
--
-- Bir bildirim sistemi kurmak (§21'in yasakladığı şey) her öğrenci
-- hareketini öğretmenin telefonuna taşırdı. Burada tersi yapılıyor:
-- akış öğretmenin kendi hızında okuduğu bir liste, "görüldü" ise
-- yalnız listeyi temizleme aracı.
--
-- ============================================================
-- NEDEN SÜTUN + RPC, NEDEN RLS UPDATE DEĞİL
--
-- Not ÖĞRENCİNİN satırı; öğretmenin o satırda değiştirebileceği tek şey
-- bu işaret. RLS kolon düzeyinde kısıtlayamadığı için öğretmene genel
-- UPDATE açmak, notun METNİNİ de değiştirebilmesi demekti — §13'ün
-- "öğrencinin kendi cümlesi" olma niteliğini bozardı. Tek sütuna yazma
-- hakkı ancak SECURITY DEFINER RPC ile verilebilir (097'deki gerekçenin
-- aynısı).
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.student_day_notes
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seen_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Akış "görülmemişler önce" diye okunuyor; kısmi indeks yalnız o kümeyi
-- tutuyor çünkü görülmüş notlar listeden düşüyor.
CREATE INDEX IF NOT EXISTS idx_day_notes_unseen
  ON public.student_day_notes (workspace_id, updated_at DESC)
  WHERE seen_at IS NULL;

-- ============================================================
-- mark_day_note_seen
--
-- İDEMPOTENT: zaten görülmüş notu yeniden damgalamaz. Öğretmen aynı
-- düğmeye iki kez basarsa ilk görme anı korunur — "ne zaman gördü"
-- sorusunun cevabı ilk okumadır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_day_note_seen(p_note_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_day_notes WHERE id = p_note_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Not bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.student_day_notes
  SET seen_at = NOW(),
      seen_by_profile_id = public.current_profile_id()
  WHERE id = p_note_id
    AND seen_at IS NULL;

  RETURN jsonb_build_object('note_id', p_note_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mark_day_note_seen(UUID) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.mark_day_note_seen(UUID);
--   DROP INDEX IF EXISTS public.idx_day_notes_unseen;
--   ALTER TABLE public.student_day_notes
--     DROP COLUMN IF EXISTS seen_by_profile_id,
--     DROP COLUMN IF EXISTS seen_at;
-- ============================================================
