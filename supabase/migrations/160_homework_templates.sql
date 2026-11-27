-- ============================================================
-- 160 — Ödev şablonları (Feature Showcase PRD 10.3 · Faz 2d)
--
-- "TYT haftalık rutin", "Paragraf rutini" gibi tekrar eden görev
-- kümeleri bir kez kaydedilir; öğrenciye uygulanınca TASLAK görevler
-- oluşur (create_academic_task, 148). Yayın yine öğretmenin onayıyla:
-- şablon hiçbir şeyi kendiliğinden yayımlamaz.
--
-- Kalemler JSONB: [{ scope_id, kind, title, target_minutes, checklist[] }].
-- Biçim uygulamada doğrulanır (zod); burada yalnız dizi ve boyut sınırı.
-- Uygulama anında her kalem create_academic_task'tan geçer; ders/kapsam
-- öğrencide yoksa o RPC'nin kendi kuralı reddeder.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.homework_templates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  items                  JSONB NOT NULL DEFAULT '[]'::JSONB
                         CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
  created_by_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homework_templates_workspace
  ON public.homework_templates (workspace_id, name);

ALTER TABLE public.homework_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.homework_templates FROM anon;

DROP POLICY IF EXISTS homework_templates_select_teacher ON public.homework_templates;
CREATE POLICY homework_templates_select_teacher ON public.homework_templates
  FOR SELECT USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS homework_templates_insert_teacher ON public.homework_templates;
CREATE POLICY homework_templates_insert_teacher ON public.homework_templates
  FOR INSERT WITH CHECK (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS homework_templates_update_teacher ON public.homework_templates;
CREATE POLICY homework_templates_update_teacher ON public.homework_templates
  FOR UPDATE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  ) WITH CHECK (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );

DROP POLICY IF EXISTS homework_templates_delete_teacher ON public.homework_templates;
CREATE POLICY homework_templates_delete_teacher ON public.homework_templates
  FOR DELETE USING (
    (SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher']))
  );
