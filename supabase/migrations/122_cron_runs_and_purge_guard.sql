-- ============================================================
-- 122 — SAKLAMA TEMİZLİĞİ ÇALIŞSIN VE ÇALIŞTIĞI GÖRÜNSÜN
--
-- ============================================================
-- İKİ AÇIK
--
-- 1. Cron (/api/cron/purge-auth-events) purge_auth_event_ips'i OTURUMSUZ
--    istemciyle, yani anon olarak çağırıyordu. 109 anon'un fonksiyon
--    yetkilerini kaldırdı; 109'un notu "cron service_role kullanıyor"
--    diyordu ama kullanmıyordu. Gizlilik metnindeki 90 günlük IP silme
--    taahhüdü büyük olasılıkla o günden beri yerine getirilmiyordu —
--    ve bunu gösteren hiçbir şey yoktu.
-- 2. purge_auth_event_ips yetki DENETLEMİYORDU: giriş yapmış herhangi bir
--    kullanıcı tetikleyebiliyordu (etkisi zararsız, ama kapı açıktı).
--
-- DÜZELTME
--   - Fonksiyon yalnız service_role ya da platform yöneticisi içindir.
--   - Cron service client kullanır (sır korumalı, yalnız sunucuda çalışan
--     bir iş — 056'daki "service key yalnız zorunluysa" ilkesiyle uyumlu).
--   - cron_runs: her çalışma bir satır. Yönetimdeki Sistem sekmesi "son
--     çalışma" ve sonucu buradan gösterir. Sessiz başarısızlık bitti.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job          TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  ok           BOOLEAN,
  affected     INTEGER,
  -- Hata MESAJI değil KODU/kısa özeti; kişisel veri yazılmaz.
  error        TEXT CHECK (error IS NULL OR length(error) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started ON public.cron_runs (job, started_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
-- Politika yok: yalnız service_role yazar, okuma admin RPC'siyle (124).
REVOKE ALL ON public.cron_runs FROM anon, authenticated;


CREATE OR REPLACE FUNCTION public.purge_auth_event_ips()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH temizlenen AS (
    UPDATE public.auth_events
    SET ip = NULL, city = NULL, user_agent = NULL
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND (ip IS NOT NULL OR city IS NOT NULL OR user_agent IS NOT NULL)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM temizlenen;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_auth_event_ips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_auth_event_ips() TO authenticated, service_role;

DO $dogrula$
BEGIN
  IF has_table_privilege('authenticated', 'public.cron_runs', 'SELECT')
     OR has_table_privilege('anon', 'public.cron_runs', 'SELECT') THEN
    RAISE EXCEPTION '122 DOĞRULAMA: cron_runs doğrudan okunabiliyor.';
  END IF;
  IF has_function_privilege('anon', 'public.purge_auth_event_ips()', 'EXECUTE') THEN
    RAISE EXCEPTION '122 DOĞRULAMA: temizlik anon''a açık.';
  END IF;
  IF pg_get_functiondef('public.purge_auth_event_ips()'::regprocedure) NOT LIKE '%Permission denied%' THEN
    RAISE EXCEPTION '122 DOĞRULAMA: temizlik fonksiyonu yetki denetlemiyor.';
  END IF;
  RAISE NOTICE '122: cron_runs hazır, temizlik yalnız service_role/yönetici.';
END;
$dogrula$;

-- ROLLBACK: 089'daki purge_auth_event_ips tanımı; DROP TABLE public.cron_runs;
