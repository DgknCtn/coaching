-- ============================================================
-- 142_admin_system_status_member_login
--
-- BELİRTİ: Yönetim paneli → Sistem: "Sistem durumu alınamadı";
-- veritabanı boyutu, saklama temizliği ve zamanlanmış işler boş.
-- Genel bakış, Güvenlik ve Uyum sayfalarındaki aynı kart da etkilendi.
--
-- SEBEP: 138 öğrenci PIN tablosunu (`student_login_codes`) silip yerine
-- koç/öğrenci/veli için ortak `member_login_codes`'u kurdu. 124'teki
-- `admin_system_status` ise kilitli PIN sayısını hâlâ eski tablodan
-- okuyordu. plpgsql gövdesi çağrı anında derlendiği için migration
-- sorunsuz uygulandı; fonksiyon ancak çağrıldığında
-- 'relation "public.student_login_codes" does not exist' ile patladı ve
-- ekran hatayı genel bir "alınamadı" kartına çevirdi.
--
-- ÇÖZÜM: aynı fonksiyon, `pin_locked` artık `member_login_codes`'tan.
-- İmza ve dönen JSON şekli DEĞİŞMEDİ; ekran kodu dokunulmadan düzelir.
--
-- tests/migration-dropped-table-refs.test.ts bu sınıf hatayı (silinen
-- tabloyu okuyan, sonradan yeniden tanımlanmamış fonksiyon) artık
-- migration'lar üzerinde yakalıyor.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

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
    -- 138: öğrenci, veli ve koç PIN'leri tek tabloda.
    'pin_locked', (SELECT COUNT(*) FROM public.member_login_codes WHERE locked_until > NOW()),
    'rate_limit_rows', (SELECT COUNT(*) FROM public.rate_limit_counters)
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_system_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_system_status() TO authenticated;
