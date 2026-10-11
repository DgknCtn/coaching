-- ============================================================
-- 146 — YAPAY ZEKÂ ÖZETLERİ İÇİN AYLIK KOTA (canlıya alma, Faz 6)
--
-- Her özet bir dış servis çağrısı ve paraya mal oluyor. Çalışma alanı
-- başına takvim ayında (İstanbul) en fazla 100 özet. Asıl bütçe sınırı
-- AI Gateway panelinde; bu kota tek bir alanın bütçeyi tüketmesini
-- engeller.
--
-- Tablo doğrudan okunamaz/yazılamaz; yalnız consume_ai_quota ile. Kayıt
-- yalnız TÜR ve ZAMAN tutar — öğrenci, içerik, istem saklanmaz.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('coach_summary', 'parent_draft')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_time
  ON public.ai_usage (workspace_id, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- Bilinçli olarak POLİTİKA YOK.
REVOKE ALL ON public.ai_usage FROM anon, authenticated;

-- Hak varsa bir birim düşer ve KALAN hakkı döner; yoksa -1.
-- Çağıran o alanın owner/teacher'ı olmalı.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_workspace_id UUID, p_kind TEXT)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  c_limit CONSTANT INTEGER := 100;
  v_month_start TIMESTAMPTZ;
  v_used INTEGER;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF p_kind NOT IN ('coach_summary', 'parent_draft') THEN
    RAISE EXCEPTION 'Invalid kind';
  END IF;

  -- Aynı alan için eşzamanlı çağrılar sırayla sayılsın.
  PERFORM pg_advisory_xact_lock(hashtext('ai_quota:' || p_workspace_id::TEXT));

  v_month_start := date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul';
  SELECT COUNT(*) INTO v_used FROM public.ai_usage
  WHERE workspace_id = p_workspace_id AND created_at >= v_month_start;

  IF v_used >= c_limit THEN
    RETURN -1;
  END IF;

  INSERT INTO public.ai_usage (workspace_id, kind) VALUES (p_workspace_id, p_kind);
  RETURN c_limit - v_used - 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT) TO authenticated;

DO $dogrula$
BEGIN
  IF has_table_privilege('authenticated', 'public.ai_usage', 'SELECT') THEN
    RAISE EXCEPTION '146 DOĞRULAMA: ai_usage doğrudan okunabiliyor.';
  END IF;
  IF has_function_privilege('anon', 'public.consume_ai_quota(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '146 DOĞRULAMA: anon''a açık.';
  END IF;
END;
$dogrula$;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.consume_ai_quota(UUID, TEXT); DROP TABLE IF EXISTS public.ai_usage;
