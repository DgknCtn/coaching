-- ============================================================
-- 126 — MÜŞTERİ LİSTESİNDE KULLANIM SÜTUNLARI
--
-- Liste "bu müşteri var" diyordu; hangisinin ürünü gerçekten kullandığı
-- görünmüyordu. Üç yeni sütun (hepsi sayı ya da zaman; öğrenci adı yok):
--
--   teacher_last_login_at  sahip/öğretmenlerin son başarılı girişi
--                          (auth_events; 124'teki aktiflik tanımıyla aynı)
--   homework_7d            son 7 günde verilen ödev (homework_batches)
--   active_students_7d     son 7 günde teslim eden öğrenci sayısı
--
-- Arayüz bunlardan kurala dayalı, AÇIKÇA yazılı etiketler üretir
-- ("7 gündür öğretmen girişi yok"); uydurma bir sağlık puanı yok.
--
-- Dönüş tipi değiştiği için DROP + CREATE; yetkiler yeniden veriliyor.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_list_workspaces(
  p_search  TEXT DEFAULT NULL,
  p_limit   INTEGER DEFAULT 100,
  p_status  TEXT DEFAULT NULL,
  p_plan    TEXT DEFAULT NULL,
  p_partner TEXT DEFAULT NULL
)
RETURNS TABLE (
  workspace_id     UUID,
  workspace_name   TEXT,
  owner_name       TEXT,
  owner_email      TEXT,
  created_at       TIMESTAMPTZ,
  plan             TEXT,
  status           TEXT,
  active_students  INTEGER,
  student_limit    INTEGER,
  trial_ends_at    TIMESTAMPTZ,
  license_ends_at  TIMESTAMPTZ,
  total_paid_kurus BIGINT,
  partner_code     TEXT,
  license_student_count INTEGER,
  license_months        INTEGER,
  last_activity_at      TIMESTAMPTZ,
  pending_order_kurus   BIGINT,
  -- 126:
  teacher_last_login_at TIMESTAMPTZ,
  homework_7d           INTEGER,
  active_students_7d    INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    p.full_name,
    p.email,
    w.created_at,
    w.plan,
    w.status,
    (SELECT COUNT(*)::INTEGER FROM public.students s
      WHERE s.workspace_id = w.id AND s.status = 'active'),
    w.student_limit,
    w.trial_ends_at,
    l.ends_at,
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'paid'), 0)::BIGINT,
    pt.code,
    l.student_count,
    (CASE WHEN l.starts_at IS NULL THEN NULL ELSE
      (EXTRACT(YEAR FROM age(l.ends_at, l.starts_at)) * 12
       + EXTRACT(MONTH FROM age(l.ends_at, l.starts_at)))::INTEGER
    END),
    (SELECT MAX(a.created_at) FROM public.audit_events a
      WHERE a.workspace_id = w.id),
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'pending'), 0)::BIGINT,
    -- Öğretmen girişi: idx_auth_events_profile_type_at (124).
    (SELECT MAX(e.created_at)
       FROM public.workspace_members m
       JOIN public.auth_events e
         ON e.profile_id = m.profile_id AND e.event_type = 'login.success'
      WHERE m.workspace_id = w.id AND m.status = 'active'
        AND m.role IN ('owner', 'teacher')),
    (SELECT COUNT(*)::INTEGER FROM public.homework_batches hb
      WHERE hb.workspace_id = w.id AND hb.created_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(DISTINCT hb.student_id)::INTEGER
       FROM public.homework_items i
       JOIN public.homework_batches hb ON hb.id = i.homework_batch_id
      WHERE hb.workspace_id = w.id AND i.submitted_at > NOW() - INTERVAL '7 days')
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_profile_id
  LEFT JOIN public.partners pt ON pt.id = w.referred_by_partner_id
  LEFT JOIN public.workspace_licenses l
    ON l.workspace_id = w.id AND l.status = 'active'
  WHERE (
      p_search IS NULL
      OR w.name ILIKE '%' || p_search || '%'
      OR p.full_name ILIKE '%' || p_search || '%'
      OR p.email ILIKE '%' || p_search || '%'
    )
    AND (p_status IS NULL OR w.status = p_status)
    AND (p_plan IS NULL OR w.plan = p_plan)
    AND (
      p_partner IS NULL
      OR (p_partner = 'with' AND w.referred_by_partner_id IS NOT NULL)
      OR (p_partner = 'without' AND w.referred_by_partner_id IS NULL)
    )
  ORDER BY w.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_workspaces(TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

DO $dogrula$
BEGIN
  IF has_function_privilege('anon', 'public.admin_list_workspaces(text,integer,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '126 DOĞRULAMA: admin_list_workspaces anon''a açık.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_list_workspaces(text,integer,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION '126 DOĞRULAMA: admin_list_workspaces authenticated''a kapalı (panel boş kalır).';
  END IF;
  IF pg_get_functiondef('public.admin_list_workspaces(text,integer,text,text,text)'::regprocedure)
     NOT LIKE '%is_platform_admin()%' THEN
    RAISE EXCEPTION '126 DOĞRULAMA: yönetici denetimi yok.';
  END IF;
  RAISE NOTICE '126: müşteri listesinde son öğretmen girişi, 7 günlük ödev ve aktif öğrenci.';
END;
$dogrula$;

-- ROLLBACK: 063'teki admin_list_workspaces tanımı (DROP + CREATE + GRANT).
