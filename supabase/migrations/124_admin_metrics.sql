-- ============================================================
-- 124 — YÖNETİM ÖLÇÜMLERİ
--
-- ============================================================
-- İLKELER (060'tan devralınır)
--
--   - Her fonksiyon is_platform_admin() ile başlar; RLS toptan atlanmaz,
--     her soru için ayrı ve DAR bir fonksiyon.
--   - ÖĞRENCİ VE VELİ YALNIZ SAYI. Öğretmen (müşteri) adıyla görünür —
--     kullanıcı kararı (27 Eylül 2026). Öğrenci adı, ödev içeriği, not ya
--     da audit_events.detail HİÇBİR fonksiyondan dönmez; kısıt burada,
--     arayüzde değil (tests/admin-privacy.test.ts bunu denetler).
--   - Kütüphane alanı (069) bir kiracı değil; sayımlardan hariç.
--   - Pencereler sınırlı (en fazla 365 gün).
--
-- AKTİFLİK TANIMI (tek yerde): son N günde başarılı bir girişi
-- (auth_events 'login.success') olan kişi. Öğrenci için ayrıca son N günde
-- ödev TESLİMİ de aktiflik sayılır (giriş kaydı 122'den önce eksikti).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Kullanıcı sayıları
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_user_counts()
RETURNS TABLE (
  teachers          INTEGER,
  students          INTEGER,
  students_with_account INTEGER,
  parents           INTEGER,
  active_teachers_7d  INTEGER,
  active_teachers_30d INTEGER,
  active_students_7d  INTEGER,
  active_students_30d INTEGER,
  active_parents_7d   INTEGER,
  active_parents_30d  INTEGER,
  new_workspaces_30d  INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH tenants AS (SELECT id FROM public.workspaces WHERE NOT is_library),
  members AS (
    SELECT DISTINCT m.profile_id,
      CASE WHEN m.role IN ('owner','teacher') THEN 'teacher' ELSE m.role END AS kind
    FROM public.workspace_members m
    WHERE m.status = 'active' AND m.workspace_id IN (SELECT id FROM tenants)
      AND m.role IN ('owner','teacher','student','parent')
  ),
  logins AS (
    SELECT profile_id, MAX(created_at) AS last_at
    FROM public.auth_events
    WHERE event_type = 'login.success' AND profile_id IS NOT NULL
      AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY profile_id
  ),
  submits AS (
    SELECT s.profile_id, MAX(i.submitted_at) AS last_at
    FROM public.homework_items i
    JOIN public.homework_batches b ON b.id = i.homework_batch_id
    JOIN public.students s ON s.id = b.student_id
    WHERE i.submitted_at > NOW() - INTERVAL '30 days' AND s.profile_id IS NOT NULL
    GROUP BY s.profile_id
  ),
  act AS (
    SELECT m.profile_id, m.kind, GREATEST(l.last_at, CASE WHEN m.kind = 'student' THEN sb.last_at END) AS last_at
    FROM members m
    LEFT JOIN logins l ON l.profile_id = m.profile_id
    LEFT JOIN submits sb ON sb.profile_id = m.profile_id
  )
  SELECT
    (SELECT COUNT(DISTINCT profile_id)::INT FROM members WHERE kind = 'teacher'),
    (SELECT COUNT(*)::INT FROM public.students s WHERE s.status = 'active' AND s.workspace_id IN (SELECT id FROM tenants)),
    (SELECT COUNT(*)::INT FROM public.students s WHERE s.status = 'active' AND s.profile_id IS NOT NULL AND s.workspace_id IN (SELECT id FROM tenants)),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM members WHERE kind = 'parent'),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'teacher' AND last_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'teacher' AND last_at IS NOT NULL),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'student' AND last_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'student' AND last_at IS NOT NULL),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'parent' AND last_at > NOW() - INTERVAL '7 days'),
    (SELECT COUNT(DISTINCT profile_id)::INT FROM act WHERE kind = 'parent' AND last_at IS NOT NULL),
    (SELECT COUNT(*)::INT FROM tenants t JOIN public.workspaces w ON w.id = t.id WHERE w.created_at > NOW() - INTERVAL '30 days');
END;
$fn$;


-- ------------------------------------------------------------
-- 2) Günlük zaman serisi
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_timeseries(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day             DATE,
  new_workspaces  INTEGER,
  active_users    INTEGER,
  logins          INTEGER,
  failed_logins   INTEGER,
  homework_published INTEGER,
  approvals       INTEGER,
  submissions     INTEGER,
  sessions_done   INTEGER,
  revenue_kurus   BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_from DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE - (v_days - 1);
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(v_from, (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE, '1 day')::DATE AS d
  ),
  tenants AS (SELECT id FROM public.workspaces WHERE NOT is_library),
  ws AS (
    SELECT (created_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) AS n
    FROM public.workspaces WHERE NOT is_library AND created_at >= v_from
    GROUP BY 1
  ),
  ae AS (
    SELECT (created_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d,
      COUNT(DISTINCT profile_id) FILTER (WHERE event_type = 'login.success') AS au,
      COUNT(*) FILTER (WHERE event_type = 'login.success') AS ok,
      COUNT(*) FILTER (WHERE event_type = 'login.failed') AS bad
    FROM public.auth_events WHERE created_at >= v_from
    GROUP BY 1
  ),
  hb AS (
    SELECT (created_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) AS n
    FROM public.homework_batches
    WHERE created_at >= v_from AND workspace_id IN (SELECT id FROM tenants)
    GROUP BY 1
  ),
  ap AS (
    SELECT (approved_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) AS n
    FROM public.homework_items
    WHERE approved_at >= v_from AND workspace_id IN (SELECT id FROM tenants)
    GROUP BY 1
  ),
  sb AS (
    SELECT (submitted_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) AS n
    FROM public.homework_items
    WHERE submitted_at >= v_from AND workspace_id IN (SELECT id FROM tenants)
    GROUP BY 1
  ),
  ss AS (
    SELECT (COALESCE(actual_at, planned_at) AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) AS n
    FROM public.service_sessions
    WHERE status = 'yapildi' AND COALESCE(actual_at, planned_at) >= v_from
      AND workspace_id IN (SELECT id FROM tenants)
    GROUP BY 1
  ),
  rv AS (
    SELECT (paid_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, SUM(gross_kurus) AS k
    FROM public.billing_orders
    WHERE status = 'paid' AND paid_at >= v_from
    GROUP BY 1
  )
  SELECT days.d,
    COALESCE(ws.n, 0)::INT, COALESCE(ae.au, 0)::INT, COALESCE(ae.ok, 0)::INT, COALESCE(ae.bad, 0)::INT,
    COALESCE(hb.n, 0)::INT, COALESCE(ap.n, 0)::INT, COALESCE(sb.n, 0)::INT, COALESCE(ss.n, 0)::INT,
    COALESCE(rv.k, 0)::BIGINT
  FROM days
  LEFT JOIN ws ON ws.d = days.d
  LEFT JOIN ae ON ae.d = days.d
  LEFT JOIN hb ON hb.d = days.d
  LEFT JOIN ap ON ap.d = days.d
  LEFT JOIN sb ON sb.d = days.d
  LEFT JOIN ss ON ss.d = days.d
  LEFT JOIN rv ON rv.d = days.d
  ORDER BY days.d;
END;
$fn$;


-- ------------------------------------------------------------
-- 3) Öğretmen etkinliği (öğretmen ADIYLA — öğrenci yalnız sayı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_teacher_activity(
  p_days   INTEGER DEFAULT 30,
  p_search TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 200
)
RETURNS TABLE (
  profile_id        UUID,
  teacher_name      TEXT,
  teacher_email     TEXT,
  workspace_id      UUID,
  workspace_name    TEXT,
  last_login_at     TIMESTAMPTZ,
  logins            INTEGER,
  homework_published INTEGER,
  approvals         INTEGER,
  sessions_marked   INTEGER,
  active_students   INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT DISTINCT ON (m.profile_id) m.profile_id, m.workspace_id
    FROM public.workspace_members m
    JOIN public.workspaces w ON w.id = m.workspace_id
    WHERE m.status = 'active' AND m.role IN ('owner','teacher') AND NOT w.is_library
    ORDER BY m.profile_id, (m.role = 'owner') DESC, m.created_at
  )
  SELECT
    p.id, p.full_name, p.email, t.workspace_id, w.name,
    (SELECT MAX(e.created_at) FROM public.auth_events e
       WHERE e.profile_id = p.id AND e.event_type = 'login.success'),
    (SELECT COUNT(*)::INT FROM public.auth_events e
       WHERE e.profile_id = p.id AND e.event_type = 'login.success' AND e.created_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.audit_events a
       WHERE a.actor_profile_id = p.id AND a.action = 'homework.publish' AND a.created_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.homework_items i
       WHERE i.approved_by_profile_id = p.id AND i.approved_at >= v_since),
    (SELECT COUNT(*)::INT FROM public.audit_events a
       WHERE a.actor_profile_id = p.id AND a.action = 'session.outcome' AND a.created_at >= v_since),
    (SELECT COUNT(DISTINCT b.student_id)::INT FROM public.homework_items i
       JOIN public.homework_batches b ON b.id = i.homework_batch_id
       WHERE b.workspace_id = t.workspace_id AND i.submitted_at >= v_since)
  FROM t
  JOIN public.profiles p ON p.id = t.profile_id
  JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE p_search IS NULL
     OR p.full_name ILIKE '%' || p_search || '%'
     OR p.email ILIKE '%' || p_search || '%'
     OR w.name ILIKE '%' || p_search || '%'
  ORDER BY 6 DESC NULLS LAST
  LIMIT LEAST(COALESCE(p_limit, 200), 500);
END;
$fn$;


-- ------------------------------------------------------------
-- 4) Özellik kullanımı (eylem türü × gün; detail YOK)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_feature_usage(p_days INTEGER DEFAULT 30)
RETURNS TABLE (action TEXT, total INTEGER, workspaces INTEGER, last_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT a.action, COUNT(*)::INT, COUNT(DISTINCT a.workspace_id)::INT, MAX(a.created_at)
  FROM public.audit_events a
  WHERE a.created_at >= NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365))
    AND a.action <> 'workspace.switch'
    AND a.workspace_id IN (SELECT id FROM public.workspaces WHERE NOT is_library)
  GROUP BY a.action
  ORDER BY 2 DESC;
END;
$fn$;


-- ------------------------------------------------------------
-- 5) Gelir
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revenue(p_months INTEGER DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_months INTEGER := LEAST(GREATEST(COALESCE(p_months, 12), 1), 36);
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object(
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', m.mon, 'kurus', COALESCE(r.k, 0), 'orders', COALESCE(r.n, 0)) ORDER BY m.mon)
      FROM (
        SELECT to_char(generate_series(
          date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') - make_interval(months => v_months - 1),
          date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul'), '1 month'), 'YYYY-MM') AS mon
      ) m
      LEFT JOIN (
        SELECT to_char(date_trunc('month', paid_at AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM') AS mon,
               SUM(gross_kurus) AS k, COUNT(*) AS n
        FROM public.billing_orders WHERE status = 'paid'
        GROUP BY 1
      ) r ON r.mon = m.mon
    ), '[]'::jsonb),
    'active_licenses', (SELECT COUNT(*) FROM public.workspace_licenses WHERE status = 'active' AND ends_at > NOW()),
    'licensed_students', (SELECT COALESCE(SUM(student_count), 0) FROM public.workspace_licenses WHERE status = 'active' AND ends_at > NOW()),
    'expiring', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'ends_at') FROM (
        SELECT jsonb_build_object('workspace_id', w.id, 'workspace_name', w.name, 'kind', 'license',
                                  'ends_at', l.ends_at, 'student_count', l.student_count) AS x
        FROM public.workspace_licenses l JOIN public.workspaces w ON w.id = l.workspace_id
        WHERE l.status = 'active' AND l.ends_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        UNION ALL
        SELECT jsonb_build_object('workspace_id', w.id, 'workspace_name', w.name, 'kind', 'trial',
                                  'ends_at', w.trial_ends_at, 'student_count', NULL)
        FROM public.workspaces w
        WHERE w.plan = 'trial' AND NOT w.is_library AND w.trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'
      ) e
    ), '[]'::jsonb),
    'failed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('order_id', o.id, 'workspace_id', w.id, 'workspace_name', w.name,
                                          'kurus', o.gross_kurus, 'reason', o.failure_reason, 'at', o.updated_at)
                       ORDER BY o.updated_at DESC)
      FROM (SELECT * FROM public.billing_orders WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 50) o
      JOIN public.workspaces w ON w.id = o.workspace_id
    ), '[]'::jsonb),
    'pending', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('order_id', o.id, 'workspace_id', w.id, 'workspace_name', w.name,
                                          'kurus', o.gross_kurus, 'created_at', o.created_at,
                                          'has_token', o.provider_token IS NOT NULL)
                       ORDER BY o.created_at DESC)
      FROM (SELECT * FROM public.billing_orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50) o
      JOIN public.workspaces w ON w.id = o.workspace_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;


-- ------------------------------------------------------------
-- 6) Müşteri detayı: etkinlik + öğretmenler + sayılar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_workspace_activity(p_workspace_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  v_from DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE - (v_days - 1);
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object(
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d.d, 'published', COALESCE(hb.n, 0),
                                          'submitted', COALESCE(sb.n, 0), 'approved', COALESCE(ap.n, 0)) ORDER BY d.d)
      FROM (SELECT generate_series(v_from, (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE, '1 day')::DATE AS d) d
      LEFT JOIN (SELECT (created_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) n FROM public.homework_batches
                 WHERE workspace_id = p_workspace_id AND created_at >= v_from GROUP BY 1) hb ON hb.d = d.d
      LEFT JOIN (SELECT (submitted_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) n FROM public.homework_items
                 WHERE workspace_id = p_workspace_id AND submitted_at >= v_from GROUP BY 1) sb ON sb.d = d.d
      LEFT JOIN (SELECT (approved_at AT TIME ZONE 'Europe/Istanbul')::DATE AS d, COUNT(*) n FROM public.homework_items
                 WHERE workspace_id = p_workspace_id AND approved_at >= v_from GROUP BY 1) ap ON ap.d = d.d
    ), '[]'::jsonb),
    'teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', p.full_name, 'email', p.email, 'role', m.role,
             'last_login_at', (SELECT MAX(e.created_at) FROM public.auth_events e
                                WHERE e.profile_id = p.id AND e.event_type = 'login.success')))
      FROM public.workspace_members m JOIN public.profiles p ON p.id = m.profile_id
      WHERE m.workspace_id = p_workspace_id AND m.status = 'active' AND m.role IN ('owner','teacher')
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
      'students', (SELECT COUNT(*) FROM public.students WHERE workspace_id = p_workspace_id AND status = 'active'),
      'students_with_account', (SELECT COUNT(*) FROM public.students WHERE workspace_id = p_workspace_id AND status = 'active' AND profile_id IS NOT NULL),
      'parents', (SELECT COUNT(DISTINCT parent_profile_id) FROM public.parent_student_links WHERE workspace_id = p_workspace_id AND status = 'active'),
      'active_students_7d', (SELECT COUNT(DISTINCT b.student_id) FROM public.homework_items i JOIN public.homework_batches b ON b.id = i.homework_batch_id
                              WHERE b.workspace_id = p_workspace_id AND i.submitted_at > NOW() - INTERVAL '7 days'),
      'open_interventions', (SELECT COUNT(*) FROM public.interventions WHERE workspace_id = p_workspace_id AND status = 'open')
    ),
    'actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('action', x.action, 'total', x.n) ORDER BY x.n DESC)
      FROM (SELECT action, COUNT(*) n FROM public.audit_events
            WHERE workspace_id = p_workspace_id AND created_at >= v_from AND action <> 'workspace.switch'
            GROUP BY action) x
    ), '[]'::jsonb),
    'failed_orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kurus', gross_kurus, 'reason', failure_reason, 'at', updated_at) ORDER BY updated_at DESC)
      FROM (SELECT * FROM public.billing_orders WHERE workspace_id = p_workspace_id AND status = 'failed' ORDER BY updated_at DESC LIMIT 10) o
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;


-- ------------------------------------------------------------
-- 7) Sistem durumu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_system_status()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', pg_total_relation_size(t.relid), 'rows', t.n_live_tup)
                       ORDER BY pg_total_relation_size(t.relid) DESC)
      FROM (SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public'
            ORDER BY pg_total_relation_size(relid) DESC LIMIT 12) t
    ), '[]'::jsonb),
    'cron', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('job', c.job, 'started_at', c.started_at, 'ok', c.ok,
                                          'affected', c.affected, 'error', c.error) ORDER BY c.started_at DESC)
      FROM (SELECT * FROM public.cron_runs ORDER BY started_at DESC LIMIT 20) c
    ), '[]'::jsonb),
    'purge_overdue', (SELECT COUNT(*) FROM public.auth_events
                      WHERE created_at < NOW() - INTERVAL '90 days'
                        AND (ip IS NOT NULL OR city IS NOT NULL OR user_agent IS NOT NULL)),
    'deletion_pending', (SELECT COUNT(*) FROM public.deletion_requests WHERE status = 'pending'),
    'deletion_due', (SELECT COUNT(*) FROM public.deletion_requests WHERE status = 'pending' AND execute_after <= NOW()),
    'pin_locked', (SELECT COUNT(*) FROM public.student_login_codes WHERE locked_until > NOW()),
    'rate_limit_rows', (SELECT COUNT(*) FROM public.rate_limit_counters)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;


-- ------------------------------------------------------------
-- 8) Destek ölçüleri
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_support_metrics(p_days INTEGER DEFAULT 90)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 90), 1), 365));
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH first_reply AS (
    SELECT t.id, t.category,
      EXTRACT(EPOCH FROM (MIN(m.created_at) FILTER (WHERE m.is_staff) - t.created_at)) / 3600.0 AS hours
    FROM public.support_tickets t
    LEFT JOIN public.support_messages m ON m.ticket_id = t.id
    WHERE t.created_at >= v_since
    GROUP BY t.id, t.category, t.created_at
  )
  SELECT jsonb_build_object(
    'tickets', (SELECT COUNT(*) FROM first_reply),
    'answered', (SELECT COUNT(*) FROM first_reply WHERE hours IS NOT NULL),
    'median_first_reply_hours', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY hours) FROM first_reply WHERE hours IS NOT NULL),
    'by_category', COALESCE((SELECT jsonb_object_agg(category, n) FROM (SELECT category, COUNT(*) n FROM first_reply GROUP BY category) c), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;


-- ------------------------------------------------------------
-- 9) Uyum: silme talepleri kuyruğu (öğrenci ADI YOK)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_deletion_queue()
RETURNS TABLE (
  request_id UUID, workspace_id UUID, workspace_name TEXT, scope TEXT,
  requested_by_name TEXT, status TEXT, execute_after TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT d.id, d.workspace_id, w.name, d.scope, d.requested_by_name, d.status, d.execute_after, d.created_at
  FROM public.deletion_requests d JOIN public.workspaces w ON w.id = d.workspace_id
  ORDER BY (d.status = 'pending') DESC, d.execute_after
  LIMIT 200;
END;
$fn$;


-- ------------------------------------------------------------
-- Yetkiler ve doğrulama
-- ------------------------------------------------------------
DO $yetki$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_user_counts()', 'admin_timeseries(integer)', 'admin_teacher_activity(integer,text,integer)',
    'admin_feature_usage(integer)', 'admin_revenue(integer)', 'admin_workspace_activity(uuid,integer)',
    'admin_system_status()', 'admin_support_metrics(integer)', 'admin_deletion_queue()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_fn);
    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '124 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%is_platform_admin()%' THEN
      RAISE EXCEPTION '124 DOĞRULAMA: % yönetici denetimi yapmıyor.', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '124: dokuz yönetim ölçüm fonksiyonu yalnız yöneticiye açık.';
END;
$yetki$;

-- Etkinlik sorguları için: öğretmen başına onay sayımı.
CREATE INDEX IF NOT EXISTS idx_hi_approved_by_at
  ON public.homework_items (approved_by_profile_id, approved_at) WHERE approved_by_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_actor_action_at
  ON public.audit_events (actor_profile_id, action, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_profile_type_at
  ON public.auth_events (profile_id, event_type, created_at) WHERE profile_id IS NOT NULL;
