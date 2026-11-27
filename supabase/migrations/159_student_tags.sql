-- ============================================================
-- 159 — Öğrenci etiketleri (Feature Showcase PRD 10.2 · Faz 2b)
--
-- Çalışma alanına özel, düzenlenebilir etiketler ("tekrar ihtiyacı",
-- "sınav yaklaşıyor") ve öğrenciye bağlanması. YALNIZ öğretmen/sahip
-- görür ve yönetir: öğrenci ve veli etiketleri GÖRMEZ (notlar gibi, 031).
--
-- DİKKAT (PRD 10.5 notu): etiket bir tanı değildir. Arayüz hassas bilgi
-- girilmemesi uyarısını gösterir; burada serbest metin uzunluğu sınırlı.
--
-- YAZMA YOLU: yalnız RPC'ler (SECURITY DEFINER). Doğrudan INSERT/UPDATE/
-- DELETE politikası YOK: etiket ile öğrencinin AYNI çalışma alanında
-- olduğu ancak fonksiyon içinde doğrulanabilir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color         TEXT NOT NULL DEFAULT 'neutral'
                CHECK (color IN ('neutral', 'info', 'success', 'warning', 'destructive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_tags_name
  ON public.student_tags (workspace_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.student_tag_links (
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  tag_id        UUID NOT NULL REFERENCES public.student_tags(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_student_tag_links_tag ON public.student_tag_links (tag_id);
CREATE INDEX IF NOT EXISTS idx_student_tag_links_workspace ON public.student_tag_links (workspace_id);

ALTER TABLE public.student_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tag_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_tags_select_teacher ON public.student_tags;
CREATE POLICY student_tags_select_teacher ON public.student_tags
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS student_tag_links_select_teacher ON public.student_tag_links;
CREATE POLICY student_tag_links_select_teacher ON public.student_tag_links
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

REVOKE ALL ON public.student_tags FROM anon;
REVOKE ALL ON public.student_tag_links FROM anon;

-- ------------------------------------------------------------
-- Etiket oluştur (aynı ad varsa onu döndürür — idempotent).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student_tag(
  p_workspace_id UUID,
  p_name         TEXT,
  p_color        TEXT DEFAULT 'neutral'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_id   UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Etiket adı 1–40 karakter olmalı.';
  END IF;

  SELECT id INTO v_id FROM public.student_tags
   WHERE workspace_id = p_workspace_id AND lower(btrim(name)) = lower(v_name);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.student_tags (workspace_id, name, color)
  VALUES (p_workspace_id, v_name, COALESCE(NULLIF(p_color, ''), 'neutral'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ------------------------------------------------------------
-- Öğrenciye etiket bağla / kaldır. Etiket ile öğrenci aynı alanda olmalı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_student_tag(
  p_student_id UUID,
  p_tag_id     UUID,
  p_on         BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws UUID;
BEGIN
  SELECT s.workspace_id INTO v_ws
  FROM public.students s
  JOIN public.student_tags t ON t.workspace_id = s.workspace_id AND t.id = p_tag_id
  WHERE s.id = p_student_id;

  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'Öğrenci ya da etiket bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_on THEN
    INSERT INTO public.student_tag_links (workspace_id, student_id, tag_id)
    VALUES (v_ws, p_student_id, p_tag_id)
    ON CONFLICT (student_id, tag_id) DO NOTHING;
  ELSE
    DELETE FROM public.student_tag_links
     WHERE student_id = p_student_id AND tag_id = p_tag_id;
  END IF;
END;
$fn$;

-- ------------------------------------------------------------
-- Etiketi yeniden adlandır / renk değiştir / sil (bağlar CASCADE).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_student_tag(
  p_tag_id UUID,
  p_name   TEXT,
  p_color  TEXT,
  p_delete BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ws   UUID;
  v_name TEXT := btrim(COALESCE(p_name, ''));
BEGIN
  SELECT workspace_id INTO v_ws FROM public.student_tags WHERE id = p_tag_id;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'Etiket bulunamadı.';
  END IF;
  IF NOT public.has_workspace_role(v_ws, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_delete THEN
    DELETE FROM public.student_tags WHERE id = p_tag_id;
    RETURN;
  END IF;

  IF length(v_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Etiket adı 1–40 karakter olmalı.';
  END IF;
  UPDATE public.student_tags
     SET name = v_name,
         color = COALESCE(NULLIF(p_color, ''), color)
   WHERE id = p_tag_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_student_tag(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_student_tag(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_student_tag(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_student_tag(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_student_tag(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_tag(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
