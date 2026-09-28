-- ============================================================
-- 127 — GİRİŞLERİN ÜLKE DAĞILIMI (Güvenlik sekmesi)
--
-- "Güvende miyiz?" sorusunun bir parçası: girişler beklenen yerlerden mi
-- geliyor? Yalnız ülke başına SAYI döner — IP, şehir, cihaz ya da kişi
-- dönmez. Ülke bilgisi 90 günlük temizlikte silinmediği için (yalnız ip,
-- city, user_agent silinir) pencere 365 güne kadar anlamlı.
-- Ülkesi bilinmeyen kayıtlar tek satırda (country = NULL) toplanır.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_login_countries(p_days INTEGER DEFAULT 30)
RETURNS TABLE (country TEXT, success INTEGER, failed INTEGER, accounts INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    e.country,
    COUNT(*) FILTER (WHERE e.event_type = 'login.success')::INT,
    COUNT(*) FILTER (WHERE e.event_type IN ('login.failed', 'login.rate_limited'))::INT,
    COUNT(DISTINCT e.profile_id)::INT
  FROM public.auth_events e
  WHERE e.created_at >= NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365))
    AND e.event_type IN ('login.success', 'login.failed', 'login.rate_limited')
  GROUP BY e.country
  ORDER BY 2 DESC, 3 DESC
  LIMIT 50;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_login_countries(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_login_countries(INTEGER) TO authenticated;

DO $dogrula$
BEGIN
  IF has_function_privilege('anon', 'public.admin_login_countries(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '127 DOĞRULAMA: admin_login_countries anon''a açık.';
  END IF;
  IF pg_get_functiondef('public.admin_login_countries(integer)'::regprocedure) NOT LIKE '%is_platform_admin()%' THEN
    RAISE EXCEPTION '127 DOĞRULAMA: yönetici denetimi yok.';
  END IF;
  RAISE NOTICE '127: giriş ülke dağılımı yalnız yöneticiye, yalnız sayı.';
END;
$dogrula$;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.admin_login_countries(INTEGER);
