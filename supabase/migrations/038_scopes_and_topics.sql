-- ============================================================
-- 038_scopes_and_topics  (R5.2 — R5.3 ve R5.4'ün de temeli)
--
-- CANONICAL TOPIC: TEK SEVİYE (şartname §2.3)
-- Alt konu / kazanım / beceri hiyerarşisi YOKTUR. "Fonksiyonlar" tek
-- topic'tir, "Hareket" tek topic'tir. Yayın içindeki her mikro başlığı
-- zorunlu bir konu yapısına çevirmek kitap ekleme akışını kullanılamaz
-- hale getirirdi.
--
-- Üç şey aynı topic_id'ye bağlanır:
--   bir müfredat bloğu  -> student_curriculum_items.topic_id  (039)
--   bir kitap bölümü    -> book_sections.topic_id             (R5.3)
--   bir Koruma Havuzu satırı                                  (R5.4)
--
-- KALICI İLİŞKİ İSİM KARŞILAŞTIRMASIYLA DEĞİL topic_id İLE kurulur
-- (§8.3). Aynı isimli farklı scope'lar (ör. "Fonksiyonlar" hem TYT
-- Matematik'te hem AYT Matematik'te) ayrı topic'lerdir ve birbirine
-- karışmaz — MK-07 bunu ölçüyor.
--
-- SCOPE = ders/kapsam birimi: "TYT Matematik", "AYT Fizik",
-- "10. Sınıf Kimya". Program (YKS Sayısal, 9. Sınıf) AYRI bir tablo
-- olarak İLK SÜRÜME GİRMEZ: öğrencinin scope listesi, akış atanmış
-- scope'lardan türetilir. Böylece "Hazırlık Programı -> scope" eşlemesi
-- kurmak zorunda kalmadan R5.2 ve R5.4 çalışabilir.
--
-- VERİ GİRİŞİ: ayrı bir konu yönetimi ekranı yoktur. Şablon editöründe
-- konu adı yazılır; o scope'ta aynı ad varsa MEVCUT topic yeniden
-- kullanılır, yoksa oluşturulur. Dedup'ı aşağıdaki unique indeksler
-- garanti eder.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) academic_scopes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.academic_scopes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  -- Kitap metadata'sıyla aynı sözlükten beslenir (lib/book-taxonomy.ts);
  -- R5.3'te bölüm eşlemesi ve R5.4'te ders sekmeleri bunları kullanır.
  subject      TEXT,
  level_exam   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aynı workspace'te aynı adla iki scope olamaz; "TYT Matematik" tektir.
-- lower() ile: "TYT Matematik" ve "tyt matematik" aynı kabul edilir.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_academic_scope_name
  ON public.academic_scopes (workspace_id, lower(btrim(name)));

-- ============================================================
-- 2) topics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope_id     UUID NOT NULL REFERENCES public.academic_scopes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scope içinde konu adı tektir — "satır yazarak ekleme" akışının dedup'ı
-- buradan gelir. Farklı scope'larda aynı ad SERBESTTİR ve ayrı topic'tir.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_topic_name_in_scope
  ON public.topics (scope_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_topics_scope
  ON public.topics (workspace_id, scope_id, sort_order);

DROP TRIGGER IF EXISTS handle_updated_at ON public.academic_scopes;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.academic_scopes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at ON public.topics;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 3) RLS — eğitmen/owner
--
-- İlk R5'te tüm akış yönetimi eğitmendedir (§4.4). Öğrenci ve veli için
-- politika yazılmaz; RLS açık ve politika yoksa erişim yoktur.
-- 026'daki desen: yardımcı çağrı alt sorguya sarılır.
-- ============================================================
ALTER TABLE public.academic_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_scopes_rw ON public.academic_scopes;
CREATE POLICY academic_scopes_rw ON public.academic_scopes
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS topics_rw ON public.topics;
CREATE POLICY topics_rw ON public.topics
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- 4) upsert_academic_scope
--
-- Ada göre idempotent: aynı ad ikinci kez gönderilirse yeni satır
-- açılmaz, mevcut kaydın id'si döner.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_academic_scope(
  p_workspace_id UUID,
  p_name         TEXT,
  p_subject      TEXT DEFAULT NULL,
  p_level_exam   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_scope_id UUID;
  v_name     TEXT;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN RAISE EXCEPTION 'Kapsam adı boş olamaz'; END IF;

  SELECT id INTO v_scope_id
  FROM public.academic_scopes
  WHERE workspace_id = p_workspace_id AND lower(btrim(name)) = lower(v_name);

  IF v_scope_id IS NULL THEN
    INSERT INTO public.academic_scopes (workspace_id, name, subject, level_exam)
    VALUES (p_workspace_id, v_name, NULLIF(btrim(COALESCE(p_subject, '')), ''),
            NULLIF(btrim(COALESCE(p_level_exam, '')), ''))
    RETURNING id INTO v_scope_id;
  END IF;

  RETURN jsonb_build_object('scope_id', v_scope_id);
END;
$fn$;

-- ============================================================
-- 5) upsert_topic
--
-- Scope içinde ada göre idempotent. "Satır yazarak ekleme" akışının
-- kalbi: eğitmen aynı konuyu iki şablonda yazsa da tek topic oluşur ve
-- R5.3'teki kitap eşlemesi ile R5.4'teki Koruma Havuzu aynı kimliğe
-- bakar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_topic(
  p_scope_id   UUID,
  p_name       TEXT,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_topic_id     UUID;
  v_name         TEXT;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.academic_scopes WHERE id = p_scope_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kapsam bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN RAISE EXCEPTION 'Konu adı boş olamaz'; END IF;

  SELECT id INTO v_topic_id
  FROM public.topics
  WHERE scope_id = p_scope_id AND lower(btrim(name)) = lower(v_name);

  IF v_topic_id IS NULL THEN
    INSERT INTO public.topics (workspace_id, scope_id, name, sort_order)
    VALUES (v_workspace_id, p_scope_id, v_name, COALESCE(p_sort_order, 0))
    RETURNING id INTO v_topic_id;
  END IF;

  RETURN jsonb_build_object('topic_id', v_topic_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.upsert_topic(UUID, TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS public.upsert_academic_scope(UUID, TEXT, TEXT, TEXT);
--   DROP TABLE IF EXISTS public.topics;          -- 039'daki FK'ler önce düşmeli
--   DROP TABLE IF EXISTS public.academic_scopes;
--
-- Bu migration mevcut hiçbir tabloya dokunmaz; geri alma yalnız yeni
-- katmanı kaldırır.
-- ============================================================
