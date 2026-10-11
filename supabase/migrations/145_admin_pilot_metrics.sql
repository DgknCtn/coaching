-- ============================================================
-- 145 — PİLOT METRİKLERİ (canlıya alma, Faz 5.2)
--
-- Ücretsiz pilotta her hafta koç başına sorulan dört soru:
--   1. Koç ürünü gerçekten kullanıyor mu?      → aktif gün
--   2. Öğrenci ve veli giriyor mu?              → giriş yapan / toplam üye
--   3. İş akıyor mu?                            → teslim ve onay sayısı
--   4. Giriş karışıklık yaratıyor mu?           → PIN talebi sayısı
--
-- Yalnız SAYI döner; kişi, ad, içerik dönmez. Yalnız platform yöneticisi.
--
-- AKTİF GÜN: koçun (owner/teacher) o alanda iz bıraktığı İstanbul
-- günleri — denetim kaydı (audit_events) ya da başarılı giriş. Oturumlar
-- uzun yaşadığı için yalnız giriş günü saymak kullanımı olduğundan az
-- gösterirdi.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_pilot_metrics(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  workspace_id        UUID,
  workspace_name      TEXT,
  students            INTEGER,
  teacher_active_days INTEGER,
  members_total       INTEGER,
  members_logged_in   INTEGER,
  submitted           INTEGER,
  approved            INTEGER,
  pin_requests        INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  v_since := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 90));

  RETURN QUERY
  WITH ws AS (
    SELECT w.id, w.name
    FROM public.workspaces w
    WHERE NOT w.is_library
      AND EXISTS (SELECT 1 FROM public.students s WHERE s.workspace_id = w.id)
  ),
  teachers AS (
    SELECT m.workspace_id, m.profile_id
    FROM public.workspace_members m
    JOIN ws ON ws.id = m.workspace_id
    WHERE m.role IN ('owner', 'teacher') AND m.status = 'active'
  ),
  members AS (
    SELECT m.workspace_id, m.profile_id
    FROM public.workspace_members m
    JOIN ws ON ws.id = m.workspace_id
    WHERE m.role IN ('student', 'parent') AND m.status = 'active'
  ),
  teacher_days AS (
    SELECT t.workspace_id, (a.created_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d
    FROM teachers t
    JOIN public.audit_events a
      ON a.workspace_id = t.workspace_id AND a.actor_profile_id = t.profile_id
    WHERE a.created_at >= v_since
    UNION
    SELECT t.workspace_id, (e.created_at AT TIME ZONE 'Europe/Istanbul')::DATE
    FROM teachers t
    JOIN public.auth_events e ON e.profile_id = t.profile_id
    WHERE e.event_type = 'login.success' AND e.created_at >= v_since
  ),
  logged_in AS (
    SELECT DISTINCT mb.workspace_id, mb.profile_id
    FROM members mb
    JOIN public.auth_events e ON e.profile_id = mb.profile_id
    WHERE e.event_type = 'login.success' AND e.created_at >= v_since
  )
  SELECT
    ws.id,
    ws.name,
    (SELECT COUNT(*) FROM public.students s
       WHERE s.workspace_id = ws.id AND s.status = 'active')::INTEGER,
    (SELECT COUNT(DISTINCT td.d) FROM teacher_days td WHERE td.workspace_id = ws.id)::INTEGER,
    (SELECT COUNT(*) FROM members mb WHERE mb.workspace_id = ws.id)::INTEGER,
    (SELECT COUNT(*) FROM logged_in li WHERE li.workspace_id = ws.id)::INTEGER,
    (SELECT COUNT(*) FROM public.homework_items i
       WHERE i.workspace_id = ws.id AND i.submitted_at >= v_since)::INTEGER,
    (SELECT COUNT(*) FROM public.homework_items i
       WHERE i.workspace_id = ws.id AND i.approved_at >= v_since)::INTEGER,
    (SELECT COUNT(*) FROM public.pin_reset_requests r
       WHERE r.workspace_id = ws.id AND r.created_at >= v_since)::INTEGER
  FROM ws
  ORDER BY ws.name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_pilot_metrics(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pilot_metrics(INTEGER) TO authenticated;

DO $dogrula$
BEGIN
  IF has_function_privilege('anon', 'public.admin_pilot_metrics(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '145 DOĞRULAMA: anon''a açık.';
  END IF;
END;
$dogrula$;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.admin_pilot_metrics(INTEGER);
